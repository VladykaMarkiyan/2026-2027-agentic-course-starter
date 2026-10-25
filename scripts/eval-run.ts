/**
 * Прогін еталонного набору через готову систему (крок 06).
 *
 *   npx tsx --env-file=.env.local scripts/eval-run.ts docs/lab2/golden/queries.jsonl
 *       ХОДИТЬ У МЕРЕЖУ. Проганяє запити, рахує метрики пошуку, пише docs/lab2/eval-run.json
 *       з порожніми полями verdict і baselineVerdict.
 *
 *   npx tsx scripts/eval-run.ts --summary docs/lab2/eval-run.json
 *       БЕЗ МЕРЕЖІ. Читає заповнені вами вердикти і друкує готові рядки для eval-report.md.
 *
 * Файл зроблено КОПІЄЮ scripts/baseline.ts: єдина змістова відмінність — рядок,
 * у якому в промпт додається знайдений контекст. Доказ — git diff --no-index.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { search } from '../src/search';        // ВАШ пошук із кроку 05
import { answerWithContext } from '../src/answer'; // ВАШ генератор відповіді з кроку 05
import { mean, proportionCI95, recallAtK, reciprocalRank, transitions, type Hit, type Verdict } from '../src/metrics';

/** Те саме k, що у вашому застосунку. Змінили в застосунку — змініть і тут. */
const K = 5;
const OUT = 'docs/lab2/eval-run.json';

interface Entry {
  id: string;
  query: string;
  expected: string | string[];
  must_cite: string[];
  tags: string[];
}

interface Row {
  id: string;
  tags: string[];
  must_cite: string[];
  hits: Hit[];
  recallAtK: number | null;
  reciprocalRank: number | null;
  answer: string;
  citedDocs: string[];
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Заповнюєте РУКОЮ за правилом baseline.md. */
  verdict: Verdict | null;
  /** Переписуєте РУКОЮ з таблиці baseline.md — для таблиці переходів. */
  baselineVerdict: Verdict | null;
  citationCorrect: boolean | null;
}

const readEntries = (file: string): Entry[] =>
  readFileSync(file, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Entry);

async function run(file: string): Promise<void> {
  const entries = readEntries(file);
  const rows: Row[] = [];

  for (const entry of entries) {
    const started = performance.now();
    const hits: Hit[] = await search(entry.query, K);
    const result = await answerWithContext(entry.query, hits);
    const answerable = entry.must_cite.length > 0;

    rows.push({
      id: entry.id,
      tags: entry.tags,
      must_cite: entry.must_cite,
      hits,
      recallAtK: answerable ? recallAtK(hits, entry.must_cite, K) : null,
      reciprocalRank: answerable ? reciprocalRank(hits, entry.must_cite, K) : null,
      answer: result.text,
      citedDocs: result.citedDocs,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      latencyMs: Math.round(performance.now() - started),
      verdict: null,
      baselineVerdict: null,
      citationCorrect: null,
    });
    console.log(`${entry.id}  recall@${K}=${rows.at(-1)?.recallAtK ?? '—'}  rr=${rows.at(-1)?.reciprocalRank ?? '—'}`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify({ runAt: new Date().toISOString(), k: K, setFile: file, rows }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nЗаписано ${OUT}. Далі: поставте verdict і baselineVerdict рукою, потім --summary.`);
}

function summary(file: string): void {
  const data = JSON.parse(readFileSync(file, 'utf8')) as { k: number; rows: Row[] };
  const answerable = data.rows.filter((r) => r.must_cite.length > 0);
  const graded = answerable.filter((r) => r.verdict !== null);
  if (graded.length !== answerable.length) {
    console.error(`x не поставлено вердикт у ${answerable.length - graded.length} рядках — підсумок був би неповним`);
    process.exit(1);
  }

  const correct = graded.filter((r) => r.verdict === 'correct').length;
  const ci = proportionCI95(correct, graded.length);
  const recall = mean(answerable.map((r) => r.recallAtK ?? 0));
  const mrr = mean(answerable.map((r) => r.reciprocalRank ?? 0));
  const cited = graded.filter((r) => r.citationCorrect === true).length;

  console.log(`| Точність (correct / ${graded.length} відповідних) | ${(100 * correct / graded.length).toFixed(0)}% |`);
  console.log(`| recall@${data.k} | ${recall.toFixed(2)} |`);
  console.log(`| MRR@${data.k} | ${mrr.toFixed(2)} |`);
  console.log(`| Частка відповідей із правильною цитатою | ${(100 * cited / graded.length).toFixed(0)}% |`);
  console.log(`\nІнтервал точності (нормальне наближення, n=${graded.length}, ОБЧИСЛЕНО): `
    + `${(100 * ci.p).toFixed(0)}% ± ${(100 * ci.halfWidth).toFixed(0)} п. п.`);

  const before = Object.fromEntries(data.rows.filter((r) => r.baselineVerdict).map((r) => [r.id, r.baselineVerdict!]));
  const after = Object.fromEntries(data.rows.filter((r) => r.verdict).map((r) => [r.id, r.verdict!]));
  console.log('\n| було | стало | скільки | запити |');
  console.log('|---|---|---|---|');
  for (const t of transitions(before, after)) {
    console.log(`| ${t.from} | ${t.to} | ${t.ids.length} | ${t.ids.join(', ')} |`);
  }
}

const [first, second] = process.argv.slice(2);
if (first === '--summary') {
  summary(second ?? OUT);
} else {
  await run(first ?? 'docs/lab2/golden/queries.jsonl');
}