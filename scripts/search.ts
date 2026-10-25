/**
 * Гібридний пошук із поясненням ранжування (Лабораторна 2, крок 05).
 *   npx tsx scripts/search.ts "текст запиту"
 *   npx tsx scripts/search.ts "текст запиту" --explain
 */
import { readFileSync } from 'node:fs';
import { cosineSimilarity } from 'ai';

import { bm25From, hybridSearch } from '../src/rag/search';
import { fakeEmbedder, geminiEmbedder, ollamaEmbedder, type Embedder } from '../src/rag/embed';
import { searchBm25 } from '../src/rag/bm25';
import { rrf, RRF_K } from '../src/rag/rrf';
import type { IndexFile } from '../src/rag/store';
import { renderCitation } from '../src/rag/cite';

const INDEX_PATH = 'data/index.json';

function getEmbedderForIndex(index: IndexFile): Embedder {
  if (index.embedder.startsWith('fake:')) {
    return fakeEmbedder(index.dimensions);
  }
  if (index.embedder.startsWith('google:')) {
    return geminiEmbedder(index.dimensions);
  }
  return ollamaEmbedder();
}

export async function runSearch(): Promise<void> {
  const args = process.argv.slice(2);
  const explain = args.includes('--explain');
  const query = args.filter((a) => a !== '--explain').join(' ');

  if (!query) {
    console.log('Використання: npx tsx scripts/search.ts "<запит>" [--explain]');
    process.exit(1);
  }

  const rawIndex = readFileSync(INDEX_PATH, 'utf8');
  const index = JSON.parse(rawIndex) as IndexFile;
  const embedder = getEmbedderForIndex(index);
  const bm25 = bm25From(index);

  if (explain) {
    // Детальний вивід двох гілок і RRF
    const qv = await embedder.embedQuery(query);
    const cosines = index.chunks
      .map((c) => ({ id: c.id, score: cosineSimilarity(qv, c.vector) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

    const bm25Hits = searchBm25(bm25, query, 20);

    const vectorList = cosines.map((c) => c.id);
    const wordList = bm25Hits.map((h) => h.id);
    const fused = rrf([vectorList, wordList], RRF_K);

    console.log(`\nЗапит: "${query}"`);
    console.log('вектор (cosine)            слова (BM25)              RRF (k=60)');
    console.log('-------------------------------------------------------------------------');

    const maxRows = Math.min(5, Math.max(cosines.length, bm25Hits.length, fused.length));
    for (let i = 0; i < maxRows; i++) {
      const v = cosines[i];
      const w = bm25Hits[i];
      const r = fused[i];

      const colV = v ? `${(i + 1).toString().padStart(2)}  ${v.id.padEnd(12)} ${v.score.toFixed(4)}` : ' '.repeat(24);
      const colW = w ? `${(i + 1).toString().padStart(2)}  ${w.id.padEnd(12)} ${w.score.toFixed(2).padStart(5)}` : ' порожньо / немає в тексті';
      const colR = r ? `${(i + 1).toString().padStart(2)}  ${r.id.padEnd(12)} ${r.score.toFixed(5)}` : '';

      console.log(`${colV.padEnd(27)} ${colW.padEnd(26)} ${colR}`);
    }
    return;
  }

  const hits = await hybridSearch(index, bm25, embedder, query, 5);
  console.log(`\nЗнайдено ${hits.length} результатів для "${query}":`);
  hits.forEach((h, i) => {
    console.log(`\n${i + 1}. ${renderCitation({
      chunkId: h.chunk.id,
      docId: h.chunk.docId,
      heading: h.chunk.heading,
      start: h.chunk.start,
      end: h.chunk.end,
      quote: '',
    })} (RRF: ${h.rrf.toFixed(5)}, cosine: ${h.cosine.toFixed(4)})`);
    console.log(`   ${h.chunk.text.slice(0, 150)}...`);
  });
}

if (process.argv[1]?.endsWith('search.ts')) {
  runSearch().catch((err) => {
    console.error('Помилка пошуку:', err);
    process.exit(1);
  });
}
