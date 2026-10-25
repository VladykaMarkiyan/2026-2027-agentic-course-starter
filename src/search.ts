import { readFileSync } from 'node:fs';
import { bm25From, hybridSearch } from './rag/search';
import { fakeEmbedder, geminiEmbedder, ollamaEmbedder, type Embedder } from './rag/embed';
import type { IndexFile, IndexedChunk } from './rag/store';
import type { Hit as MetricHit } from './metrics';

let cachedIndex: IndexFile | null = null;
let cachedBm25: ReturnType<typeof bm25From> | null = null;
let cachedEmbedder: Embedder | null = null;

function getStore(): { index: IndexFile; bm25: NonNullable<typeof cachedBm25>; embedder: Embedder } {
  if (!cachedIndex || !cachedBm25 || !cachedEmbedder) {
    cachedIndex = JSON.parse(readFileSync('data/index.json', 'utf8')) as IndexFile;
    cachedBm25 = bm25From(cachedIndex);
    if (cachedIndex.embedder.startsWith('fake:')) {
      cachedEmbedder = fakeEmbedder(cachedIndex.dimensions);
    } else if (cachedIndex.embedder.startsWith('google:')) {
      cachedEmbedder = geminiEmbedder(cachedIndex.dimensions);
    } else {
      cachedEmbedder = ollamaEmbedder();
    }
  }
  return { index: cachedIndex, bm25: cachedBm25, embedder: cachedEmbedder };
}

export async function search(query: string, topK = 5): Promise<MetricHit[]> {
  const { index, bm25, embedder } = getStore();
  const hits = await hybridSearch(index, bm25, embedder, query, topK);
  return hits.map((h) => ({
    docId: h.chunk.docId,
    chunkId: h.chunk.id,
  }));
}

export function getServedChunks(chunkIds: string[]): IndexedChunk[] {
  const { index } = getStore();
  const map = new Map(index.chunks.map((c) => [c.id, c]));
  return chunkIds.map((id) => map.get(id)).filter((c): c is IndexedChunk => Boolean(c));
}
