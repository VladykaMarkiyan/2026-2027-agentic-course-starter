// Hook заборони для інструментів із командними hooks (Copilot CLI, Codex; за потреби й Claude Code без jq).
// Читає JSON події зі stdin. Якщо виклик зачіпає .env-файл — дописує рядок "denied" у журнал і блокує виклик.
// Виклик: node scripts/guard-env.mjs <source>

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// .env, .env.local, .env.production, .env.development.local…, але не .env.example і не process.env.X
const SECRET_FILE = /(^|[^A-Za-z0-9_$])\.env(\.(local|development|production|test)(\.local)?)?([^.A-Za-z0-9_]|$)/im;
const REASON = 'Політика курсу: файли .env читає і змінює людина, не агент.';

const source = process.argv[2] ?? 'unknown';
const event = JSON.parse(readFileSync(0, 'utf8'));

// Claude Code і Codex: snake_case; Copilot CLI (події camelCase): toolName/toolArgs.
const tool = event.tool_name ?? event.toolName ?? 'unknown';
let args = event.tool_input ?? event.toolArgs ?? {};
if (typeof args === 'string') {
  try {
    args = JSON.parse(args);
  } catch {
    args = { command: args };
  }
}

// Перевіряємо шляхи й команди, а не вміст файлів.
const targets = [];
if (tool === 'apply_patch') {
  // Codex кладе текст патча в command: беремо з нього тільки назви файлів.
  const patch = Array.isArray(args.command) ? args.command.join('\n') : String(args.command ?? '');
  for (const m of patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)) {
    targets.push(['files', m[1].trim()]);
  }
} else {
  for (const key of ['file_path', 'filePath', 'path', 'command']) {
    const value = Array.isArray(args[key]) ? args[key].join(' ') : args[key];
    if (typeof value === 'string') targets.push([key, value]);
  }
}

const hit = targets.find(([, value]) => SECRET_FILE.test(value));
if (hit) {
  const [key, value] = hit;
  const dir = join(process.env.CLAUDE_PROJECT_DIR ?? event.cwd ?? process.cwd(), '.agent-log');
  mkdirSync(dir, { recursive: true });

  const row = {
    ts: new Date().toISOString(),
    tool,
    input: { [key]: value.replace(/=\S+/g, '=***').slice(0, 200) }, // значення після «=» не логуємо
    result: 'denied',
    session: event.session_id ?? event.sessionId ?? 'unknown',
    source,
  };
  appendFileSync(join(dir, `${source}.jsonl`), `${JSON.stringify(row)}\n`);

  if (event.toolName !== undefined) {
    // Copilot CLI читає рішення зі stdout; причина при deny обов'язкова.
    process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: REASON }));
  }

  process.stderr.write(`${REASON}\n`);
  process.exitCode = 2;
}
