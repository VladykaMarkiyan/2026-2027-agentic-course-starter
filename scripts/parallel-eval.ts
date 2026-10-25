/**
 * Вимір паралельності (крок 07). ХОДИТЬ У МЕРЕЖУ — запускається вручну:
 *
 *   npx tsx --env-file=.env.local scripts/parallel-eval.ts 1    «до»: послідовно
 *   npx tsx --env-file=.env.local scripts/parallel-eval.ts 4    «після»: чотири гілки
 *
 * Паралелиться ЧИТАННЯ (запити набору). Запис однопотоковий: гілки повертають
 * результат у памʼять, у файл пише головний потік один раз після пулу.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { search } from '../src/search';
import { answerWithContext } from '../src/answer';
import { type Hit } from '../src/metrics';

/** БЮДЖЕТ. Записується ДО запуску і дослівно переноситься в budget.md. */
export interface Budget {
  /** Максимум гілок, що виконуються одночасно. */
  readonly maxBranches: number;
  /** Стеля токенів на весь прогін: нова гілка не стартує, коли її перетнуто. */
  readonly maxTokens: number;
  /** Стеля часу стіни на весь прогін, мс. */
  readonly maxWallMs: number;
}

export const BUDGET: Budget = { maxBranches: 4, maxTokens: 200_000, maxWallMs: 10 * 60_000 };

export interface BranchResult {
  readonly id: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly ms: number;
}

/**
 * Пул фіксованої ширини, без зовнішніх залежностей.
 * Чому не чистий Promise.all над усіма задачами: по-перше, ширина не обмежена;
 * по-друге, Promise.all відкидається на ПЕРШІЙ помилці (скажімо, 429), і токени
 * гілок, які вже відпрацювали, зникають разом із результатом. Тут кожна гілка
 * ловить свою помилку сама, тож облік зберігається повністю.
 */
export async function runPool<T>(
  tasks: readonly (() => Promise<T>)[],
  budget: Budget,
  spentTokens: () => number,
): Promise<{ results: (T | Error)[]; stoppedEarly: boolean }> {
  const results: (T | Error)[] = new Array(tasks.length);
  const startedAt = performance.now();
  let next = 0;
  let stoppedEarly = false;

  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      // ПРАВИЛО ЗУПИНКИ: перевіряється перед стартом нової гілки, а не всередині неї.
      if (spentTokens() >= budget.maxTokens || performance.now() - startedAt >= budget.maxWallMs) {
        stoppedEarly = true;
        return;
      }
      const i = next++;
      try {
        results[i] = await tasks[i]!();
      } catch (error) {
        results[i] = error instanceof Error ? error : new Error(String(error));
      }
    }
  };

  const width = Math.max(1, Math.min(budget.maxBranches, tasks.length));
  await Promise.all(Array.from({ length: width }, worker));
  return { results, stoppedEarly };
}

const K = 5;
const OUT = 'docs/lab2/parallel-run.json';

interface Entry { id: string; query: string; must_cite: string[] }

const width = Number(process.argv[2] ?? 1);
const budget: Budget = { ...BUDGET, maxBranches: Number.isFinite(width) ? width : 1 };

const entries: Entry[] = readFileSync('docs/lab2/golden/queries.jsonl', 'utf8')
  .replace(/^﻿/, '')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line) as Entry);

let spent = 0;

const tasks = entries.map((entry) => async (): Promise<BranchResult> => {
  const started = performance.now();
  const hits: Hit[] = await search(entry.query, K);
  const result = await answerWithContext(entry.query, hits);
  // Сума по гілках: у AI SDK 7 підсумок за весь прогін агента дає totalUsage.
  // У версії, закріпленій у Лабораторній 1, те саме число лежить на result.usage —
  // звірте `npm ls ai` і типи у своєму редакторі і запишіть у budget.md, яке поле взяли.
  const usage = result.usage;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  spent += inputTokens + outputTokens;
  return { id: entry.id, inputTokens, outputTokens, ms: Math.round(performance.now() - started) };
});

// ЧАС СТІНИ міряється саме тут — навколо пулу. Облік токенів часу не дає.
const wallStart = performance.now();
const { results, stoppedEarly } = await runPool(tasks, budget, () => spent);
const wallMs = Math.round(performance.now() - wallStart);

const ok = results.filter((r): r is BranchResult => !(r instanceof Error));
const failed = results.filter((r): r is Error => r instanceof Error);
const sumBranchMs = ok.reduce((n, r) => n + r.ms, 0);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      runAt: new Date().toISOString(),
      budget,
      wallMs,
      sumBranchMs,
      inputTokens: ok.reduce((n, r) => n + r.inputTokens, 0),
      outputTokens: ok.reduce((n, r) => n + r.outputTokens, 0),
      done: ok.length,
      failed: failed.map((e) => e.message),
      stoppedEarly,
      branches: ok,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log({ width: budget.maxBranches, wallMs, sumBranchMs, done: ok.length, failed: failed.length, stoppedEarly });