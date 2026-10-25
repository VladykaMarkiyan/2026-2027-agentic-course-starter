/**
 * Побудова індексу (крок 04). Мережа тут потрібна, тому це scripts/, а не src/.
 *   npm run index                        — локальна Ollama (типово)
 *   npm run index -- --provider google   — Gemini, ключ із .env.local
 *   npm run index -- --provider fake     — Детермінований офлайн ембедер 768 вимірів
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { chunkDocument, normalize, RULE } from '../src/rag/chunk';
import { fakeEmbedder, geminiEmbedder, ollamaEmbedder, type Embedder } from '../src/rag/embed';
import { round6, saveIndex, sha256, type IndexedChunk, type IndexFile } from '../src/rag/store';

const CORPUS = 'corpus';
const OUT = 'data/index.json';
const NORMALIZATION = 'BOM прибрано, CRLF→LF, пробіли в кінці рядків прибрано';

function getEmbedder(): Embedder {
  if (process.argv.includes('--provider')) {
    const p = process.argv[process.argv.indexOf('--provider') + 1];
    if (p === 'google') return geminiEmbedder(768);
    if (p === 'fake') return fakeEmbedder(768);
    if (p === 'ollama') return ollamaEmbedder();
  }
  return ollamaEmbedder();
}

let embedder: Embedder = getEmbedder();

const started = performance.now();
const documents: IndexFile['documents'] = [];
const chunks: IndexedChunk[] = [];

const files = readdirSync(CORPUS).filter((f) => /\.(md|txt)$/i.test(f)).sort();
if (files.length < 10) throw new Error(`у ${CORPUS}/ лише ${files.length} файлів, специфікація вимагає 10–40`);

// Тестовий прогон першого фрагмента для перевірки доступності провайдера
try {
  await embedder.embedQuery('smoke test');
} catch (err: unknown) {
  console.warn(`Провайдер ${embedder.id} недоступний (${err instanceof Error ? err.message : String(err)}). Перемикання на детермінований fakeEmbedder(768).`);
  embedder = fakeEmbedder(768);
}

for (const file of files) {
  const docId = file.replace(/\.(md|txt)$/i, ''); // імʼя файлу = id зі spec.md
  const text = normalize(readFileSync(join(CORPUS, file), 'utf8'));
  const parts = chunkDocument(docId, text, RULE);
  const vectors = await embedder.embedDocuments(parts.map((p) => p.text));
  parts.forEach((part, i) => chunks.push({ ...part, vector: (vectors[i] ?? []).map(round6) }));
  documents.push({ id: docId, path: join(CORPUS, file), chars: text.length, sha256: sha256(text) });
  console.log(`  ${docId}: ${text.length} симв. → ${parts.length} фрагм.`);
}

saveIndex(OUT, {
  version: 1,
  builtAt: new Date().toISOString(),
  embedder: embedder.id,
  dimensions: embedder.dimensions,
  rule: RULE,
  normalization: NORMALIZATION,
  documents,
  chunks,
});

const seconds = (performance.now() - started) / 1000;
const lengths = chunks.map((c) => c.text.length).sort((a, b) => a - b);
console.log(`
документів:    ${documents.length}
фрагментів:    ${chunks.length}
довжина:       медіана ${lengths[Math.floor(lengths.length / 2)] ?? 0}, мін ${lengths[0] ?? 0}, макс ${lengths[lengths.length - 1] ?? 0} симв.
ембедер:       ${embedder.id}, ${embedder.dimensions} вимірів
${OUT}:        ${(statSync(OUT).size / 1024 / 1024).toFixed(1)} МБ
час побудови:  ${seconds.toFixed(1)} с
`);
