import { describe, it, expect } from 'vitest';
import {
  WorkingMemory,
  JsonPersistentMemoryStore,
  estimateTokens,
} from '../src/agent/memory';
import { DeepResearchEngine } from '../src/agent/deep-research';

describe('Memory Layer & Context Compaction (Step 04)', () => {
  it('Persistent Store correctly persists and queries facts by topic and confidence', async () => {
    const store = new JsonPersistentMemoryStore(); // in-memory
    await store.saveFact({
      text: 'Prototype pollution is prevented via __proto__ and constructor check',
      topic: 'Security',
      priority: 'critical',
      confidence: 0.99,
    });
    await store.saveFact({
      text: 'Oxlint and oxfmt format typescript code',
      topic: 'Tooling',
      priority: 'secondary',
      confidence: 0.85,
    });

    const all = await store.getAllFacts();
    expect(all).toHaveLength(2);

    const securityFacts = await store.queryFacts('Security');
    expect(securityFacts).toHaveLength(1);
    expect(securityFacts[0]?.text).toContain('Prototype pollution');
  });

  it('Fact Retention Test: preserves 100% of critical facts and >= 80% of secondary facts upon compaction', () => {
    // 12 фактів: 6 critical, 6 secondary
    const initialFacts = [
      { text: 'CRITICAL-1: Zero runtime dependencies in defu core', priority: 'critical' as const },
      { text: 'CRITICAL-2: Prototype pollution keys __proto__ are strictly rejected', priority: 'critical' as const },
      { text: 'CRITICAL-3: Rollback must complete in under 60 seconds', priority: 'critical' as const },
      { text: 'CRITICAL-4: Multi-agent short-circuit halts on budget exceed', priority: 'critical' as const },
      { text: 'CRITICAL-5: OpenTelemetry trace_id propagated across agents', priority: 'critical' as const },
      { text: 'CRITICAL-6: Secret leak checks prevent deploying exposed tokens', priority: 'critical' as const },
      { text: 'SECONDARY-1: Oxlint runs in 14ms across source files', priority: 'secondary' as const },
      { text: 'SECONDARY-2: Changelogen automates conventional changelogs', priority: 'secondary' as const },
      { text: 'SECONDARY-3: Coverage engine used is V8 via vitest', priority: 'secondary' as const },
      { text: 'SECONDARY-4: Stryker ran 103 mutants in 12 seconds', priority: 'secondary' as const },
      { text: 'SECONDARY-5: Arrays concatenate without deduplication by default', priority: 'secondary' as const },
      { text: 'SECONDARY-6: Node 22+ engine requirement declared in manifest', priority: 'secondary' as const },
    ];

    // Встановлюємо ліміт робочої пам'яті так, щоб додати факти і викликати компактифікацію
    const wm = new WorkingMemory(300, 0.75); // 300 токенів ліміт, поріг 225

    for (const f of initialFacts) {
      wm.addItem('fact', f.text, f.priority);
    }

    // Додаємо також "шум" (довгі виклики інструментів)
    wm.addItem('tool_result', 'Raw debug logs: ' + 'x'.repeat(400));

    expect(wm.isCompactionNeeded()).toBe(true);

    const metrics = wm.compact();

    // 1. Критичні факти: збережено рівно 100%
    expect(metrics.criticalTotalCount).toBe(6);
    expect(metrics.criticalPreservedCount).toBe(6);
    const criticalRetentionRate = (metrics.criticalPreservedCount / metrics.criticalTotalCount) * 100;
    expect(criticalRetentionRate).toBe(100);

    // 2. Вторинні факти: збережено щонайменше 80% (5 з 6 = 83.3%)
    expect(metrics.secondaryTotalCount).toBe(6);
    expect(metrics.secondaryPreservedCount).toBeGreaterThanOrEqual(5);
    const secondaryRetentionRate = (metrics.secondaryPreservedCount / metrics.secondaryTotalCount) * 100;
    expect(secondaryRetentionRate).toBeGreaterThanOrEqual(80);

    // 3. Зменшення розміру контексту
    expect(metrics.afterTokens).toBeLessThan(metrics.beforeTokens);
    expect(metrics.reductionRatio).toBeGreaterThan(0.3); // мінімум 30% скорочення
  });

  it('Deep Research Session: conducts multi-step research across 4 subtopics with bounded context', async () => {
    const store = new JsonPersistentMemoryStore();
    const engine = new DeepResearchEngine(store, 2000, 0.75);

    const result = await engine.executeResearch('Full-Stack Brownfield & Multi-Agent Hardening');

    expect(result.subtopicResults).toHaveLength(4);
    expect(result.persistentFactsCount).toBeGreaterThanOrEqual(10);
    expect(result.consolidatedReport).toContain('Full-Stack Brownfield & Multi-Agent Hardening');

    // Перевірка слідів контексту: контекст не роздувається безмежно
    for (const trace of result.contextTrace) {
      expect(trace.contextTokensAfter).toBeLessThan(2000);
    }
  });
});
