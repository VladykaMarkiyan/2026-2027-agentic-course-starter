/**
 * Виконавець фабрики задач (крок 00).
 * Один виклик = одна задача = один артефакт + один журнал прогону.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Task {
  readonly id: string;
  readonly input: string;
  readonly acceptance: readonly string[];
  readonly budget: { readonly max_turns: number; readonly max_usd: number; readonly timeout_s: number };
  readonly files?: readonly string[];
}

export interface AgentResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** true, якщо процес убив таймаут, а не агент завершився сам */
  readonly timedOut: boolean;
}

/** Запуск агента. У тестах підмінюється підставним. */
export type AgentRunner = (task: Task, cwd: string) => AgentResult;

export interface RunRecord {
  readonly task_id: string;
  readonly agent_path: string;
  readonly artifact_dir: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly duration_s: number;
  readonly exit_status: 'ok' | 'agent_failed' | 'timeout' | 'budget_or_turns';
  readonly acceptance: readonly { readonly cmd: string; readonly exit: number }[];
  readonly acceptance_passed: boolean;
  readonly session_id: string | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly cost_usd_estimate: number | null;
  readonly trace_id: string | null;                            // крок 06
  readonly gates: Record<string, 'pass' | 'fail' | 'skipped'>; // крок 01
}

/** Спільна обвʼязка процесу: таймаут задачі тримає сам процес. */
function spawnAgent(bin: string, args: readonly string[], cwd: string, timeoutS: number): AgentResult {
  const r = spawnSync(bin, [...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutS * 1000,
    // SIGINT дає агентові завершити хід; на Windows процес завершується безумовно
    killSignal: 'SIGINT',
    // npm-встановлені CLI у Windows — це .cmd-обгортки, тому там потрібна оболонка
    shell: process.platform === 'win32',
  });
  return {
    exitCode: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
  };
}

/** Безкоштовний шлях: Gemini CLI. -p вимушує неінтерактивний режим. */
export const geminiRunner: AgentRunner = (task, cwd) =>
  spawnAgent('gemini', ['-p', task.input, '-o', 'json'], cwd, task.budget.timeout_s);

/** OpenCode CLI шлях */
export const opencodeRunner: AgentRunner = (task, cwd) =>
  spawnAgent('opencode', ['run', task.input], cwd, task.budget.timeout_s);

/** Платний шлях: Claude Code у режимі -p. Прапорці — рівно задокументовані. */
export const claudeRunner: AgentRunner = (task, cwd) => {
  const allowed = ['Read', 'Edit', 'Bash(npm test *)', 'Bash(npm run typecheck *)', 'Bash(git diff *)'].join(',');
  return spawnAgent(
    'claude',
    [
      '-p', task.input,
      '--output-format', 'json',
      '--allowedTools', allowed,
      '--permission-mode', 'dontAsk',
      '--max-turns', String(task.budget.max_turns),
      '--max-budget-usd', String(task.budget.max_usd),
    ],
    cwd,
    task.budget.timeout_s,
  );
};

/**
 * З --output-format json Claude Code дає session_id і total_cost_usd.
 * Розбираємо метадані токенів, вартості та сесії.
 */
export function readMeta(stdout: string) {
  const empty = { session_id: null, input_tokens: null, output_tokens: null, cost_usd_estimate: null };
  try {
    const j = JSON.parse(stdout) as Record<string, unknown>;
    const usage = (j.usage ?? {}) as Record<string, unknown>;
    return {
      session_id: typeof j.session_id === 'string' ? j.session_id : null,
      input_tokens: typeof usage.input_tokens === 'number'
        ? usage.input_tokens
        : typeof j.input_tokens === 'number'
        ? j.input_tokens
        : null,
      output_tokens: typeof usage.output_tokens === 'number'
        ? usage.output_tokens
        : typeof j.output_tokens === 'number'
        ? j.output_tokens
        : null,
      cost_usd_estimate: typeof j.total_cost_usd === 'number'
        ? j.total_cost_usd
        : typeof j.cost_usd === 'number'
        ? j.cost_usd
        : null,
    };
  } catch {
    return empty;
  }
}

/** Критерії приймання — це КОМАНДИ. Виконуємо їх у дереві прогону. */
export function checkAcceptance(task: Task, cwd: string) {
  return task.acceptance.map((cmd) => {
    const r = spawnSync(cmd, { cwd, encoding: 'utf8', shell: true, timeout: task.budget.timeout_s * 1000 });
    return { cmd, exit: r.status ?? 1 };
  });
}

export function runTask(
  task: Task,
  opts: { runner: AgentRunner; agentPath: string; worktree: string; outDir: string; check?: typeof checkAcceptance },
): RunRecord {
  const dir = join(opts.outDir, `${task.id}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const started = new Date();

  const res = opts.runner(task, opts.worktree);

  // Артефакт: спершу git add -A, бо `git diff` без індексу НЕ показує нових файлів,
  // а задача «дописати тест» саме новий файл і створює.
  let patch = '';
  try {
    execFileSync('git', ['add', '-A'], { cwd: opts.worktree, stdio: ['ignore', 'ignore', 'ignore'] });
    patch = execFileSync('git', ['diff', '--cached'], { cwd: opts.worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    patch = '';
  }
  writeFileSync(join(dir, 'patch.diff'), patch, 'utf8');
  writeFileSync(join(dir, 'output.txt'), res.stdout, 'utf8');
  writeFileSync(join(dir, 'agent.log'), res.stderr, 'utf8');

  const acceptance = (opts.check ?? checkAcceptance)(task, opts.worktree);
  const ended = new Date();

  const isBudget = res.stderr.includes('Budget limit reached') || res.stdout.includes('Budget limit reached');
  const exit_status: RunRecord['exit_status'] = res.timedOut
    ? 'timeout'
    : isBudget
    ? 'budget_or_turns'
    : res.exitCode === 0
    ? 'ok'
    : 'agent_failed';

  const record: RunRecord = {
    task_id: task.id,
    agent_path: opts.agentPath,
    artifact_dir: dir,          // ← звʼязок журналу з артефактом
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_s: Math.round((ended.getTime() - started.getTime()) / 100) / 10,
    exit_status,
    acceptance,
    acceptance_passed: acceptance.length > 0 && acceptance.every((a) => a.exit === 0),
    ...readMeta(res.stdout),
    trace_id: randomBytes(16).toString('hex'), // ← крок 06: W3C trace_id для OTel/Langfuse
    gates: {},                  // ← крок 01
  };
  writeFileSync(join(dir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}
