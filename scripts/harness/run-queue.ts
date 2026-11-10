// Черга фабрики: одна задача або всі. Готує git worktree й прибирає після себе.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  mayRunTask,
  recordTaskResult,
} from './circuit-breaker';
import {
  claudeRunner,
  geminiRunner,
  opencodeRunner,
  runTask,
  type AgentRunner,
  type Task,
} from './run-task';

const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--') && a.endsWith('.jsonl'));
const file = fileArg ?? 'docs/lab3/tasks.jsonl';
const onlyId = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null;
const agentArg = process.argv.includes('--agent') ? process.argv[process.argv.indexOf('--agent') + 1] : 'gemini';

const tasks: Task[] = readFileSync(file, 'utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as Task)
  .filter((t) => onlyId === null || t.id === onlyId);

if (tasks.length === 0) throw new Error(`у ${file} немає задач${onlyId ? ` з id ${onlyId}` : ''}`);

const git = (args: string[], cwd = '.') => execFileSync('git', args, { cwd, encoding: 'utf8' });

function getRunner(name: string): { runner: AgentRunner; path: string } {
  switch (name) {
    case 'claude':
      return { runner: claudeRunner, path: 'claude-code' };
    case 'opencode':
      return { runner: opencodeRunner, path: 'opencode-cli' };
    case 'fail':
      // Тестовий раннер, який навмисне падає для перевірки спрацьовування зупинення
      return {
        runner: () => ({
          exitCode: 1,
          stdout: '',
          stderr: 'Budget limit reached (intentional stop test)',
          timedOut: false,
        }),
        path: 'failing-agent',
      };
    case 'fake':
      return {
        runner: () => ({
          exitCode: 0,
          stdout: JSON.stringify({
            session_id: 'mock-01',
            total_cost_usd: 0.001,
            usage: { input_tokens: 50, output_tokens: 25 },
          }),
          stderr: '',
          timedOut: false,
        }),
        path: 'fake-agent',
      };
    case 'gemini':
    default:
      return { runner: geminiRunner, path: 'gemini-cli' };
  }
}

const { runner, path: agentPath } = getRunner(agentArg ?? 'gemini');

for (const task of tasks) {
  // Перевірка Circuit Breaker перед кожною задачею
  const breakerCheck = mayRunTask();
  if (!breakerCheck.allow) {
    console.warn(`[CIRCUIT BREAKER BLOCKED] Чергу зупинено: ${breakerCheck.why}`);
    break;
  }

  const branch = `harness/${task.id}`;
  const tree = join('.harness-runs', task.id);

  // Очищення попереднього робочого дерева та локальної гілки за потреби
  try {
    git(['worktree', 'remove', tree, '--force']);
  } catch {}
  if (existsSync(tree)) {
    rmSync(tree, { recursive: true, force: true });
  }
  try {
    git(['branch', '-D', branch]);
  } catch {}

  git(['worktree', 'add', '-b', branch, tree, 'main']);

  try {
    const rec = runTask(task, { runner, agentPath, worktree: tree, outDir: 'runs' });
    // артефакт — у репозиторій; сира runs/ лишається в .gitignore
    const keep = join('docs', 'lab3', 'runs', `${task.id}-${new Date(rec.started_at).getTime()}`);
    mkdirSync(keep, { recursive: true });
    cpSync(rec.artifact_dir, keep, { recursive: true });

    // Оновлення стану circuit breaker
    const taskOk = rec.exit_status === 'ok' && rec.acceptance_passed;
    const tripReason = rec.exit_status !== 'ok' ? rec.exit_status : !rec.acceptance_passed ? 'acceptance_failed' : null;
    const breakerState = recordTaskResult(taskOk, tripReason);

    // гілку фіксуємо: на ній працюють брами кроку 01
    try {
      git(['add', '-A'], tree);
      git(['commit', '-m', `harness: ${task.id}`], tree);
    } catch {}

    try {
      git(['push', '-u', 'origin', branch], tree);
    } catch (pushErr) {
      console.warn(`[попередження push] Не вдалося виконати push гілки ${branch}: ${(pushErr as Error).message}`);
    }

    console.log(
      `${task.id}: ${rec.exit_status}, acceptance ${rec.acceptance_passed ? 'pass' : 'fail'} [breaker: ${breakerState.state}] → ${keep}`,
    );

    if (breakerState.state === 'open') {
      console.warn(`[CIRCUIT BREAKER OPENED] Чергу зупинено після задачі ${task.id}: аварійний стан відкрито`);
      break;
    }
  } finally {
    try {
      git(['worktree', 'remove', tree, '--force']);
    } catch {}
  }
}
