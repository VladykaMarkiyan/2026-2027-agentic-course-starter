import { describe, expect, it } from 'vitest';

import { fakeEmbedder } from '../src/rag/embed';
import { buildBm25 } from '../src/rag/bm25';
import { searchCorpus, fetchChunk, searchInput, fetchInput } from '../src/mcp/tools';
import type { Deps } from '../src/mcp/tools';

const embedder = fakeEmbedder();

async function fixture(): Promise<Deps> {
  const raw = [
    { id: 'doc-01#0000', docId: 'doc-01', heading: 'Терміни', start: 0, end: 30, text: 'Код помилки E-418 означає відмову.' },
    { id: 'doc-01#0001', docId: 'doc-01', heading: 'Заявки', start: 30, end: 60, text: 'Заявку розглядають десять днів.' },
  ];
  const chunks = await Promise.all(
    raw.map(async (c) => ({ ...c, vector: await embedder.embedQuery(c.text) })),
  );
  const index = {
    embedder: embedder.id,
    dimensions: 64,
    rule: { maxChars: 1200, minChars: 200, overlapChars: 120 },
    chunks,
    documents: [],
  } as unknown as Deps['index'];
  return { index, words: buildBm25(chunks.map((c) => ({ id: c.id, text: c.text }))), embedder };
}

describe('інструменти MCP-сервера', () => {
  it('нормальний виклик: пошук знаходить фрагмент і цитує його', async () => {
    const parts = await searchCorpus(await fixture(), { query: 'код помилки E-418', topK: 2 });
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.join('\n')).toContain('doc-01#0000');
  });

  it('порушення схеми: виклик не вдається і обробник не починає роботу', async () => {
    // Жодного конкретного коду помилки SDK не перевіряємо: перевіряємо факт —
    // схема не пропустила, отже до пошуку справа не дійшла.
    expect(searchInput.safeParse({ query: 'ок', topK: 10_000 }).success).toBe(false);
    expect(searchInput.safeParse({ query: '', topK: 1 }).success).toBe(false);
    expect(fetchInput.safeParse({ id: 'doc-01#7' }).success).toBe(false);
    await expect(searchCorpus(await fixture(), { query: 'ок', topK: 10_000 })).rejects.toThrow();
  });

  it('ВІДМОВА: вийти за межі індексу не вдається — і це головний тест кроку', async () => {
    const deps = await fixture();
    // Шлях не проходить навіть схему: інструмент не має параметра-шляху.
    expect(fetchInput.safeParse({ id: '../../.env' }).success).toBe(false);
    expect(fetchInput.safeParse({ id: 'C:\\Users\\me\\.ssh\\id_rsa' }).success).toBe(false);
    // А формально правильний id, якого немає в індексі, дає ВІДМОВУ з причиною.
    expect(() => fetchChunk(deps, { id: 'doc-99#0000' })).toThrowError(/немає в індексі/);
  });
});
