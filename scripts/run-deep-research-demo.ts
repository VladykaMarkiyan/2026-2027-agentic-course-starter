/**
 * Демонстраційний запуск Deep Research та вимірювання динаміки контексту (ЛР4, Крок 04).
 */

import { JsonPersistentMemoryStore, WorkingMemory } from '../src/agent/memory';
import { DeepResearchEngine } from '../src/agent/deep-research';

async function main() {
  console.log('=== DEEP RESEARCH & CONTEXT COMPACTION BENCHMARK ===\n');

  // 1. Fact Retention Benchmark
  console.log('--- 1. FACT RETENTION BENCHMARK ---');
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

  const wm = new WorkingMemory(300, 0.75); // 300 max, 225 threshold
  for (const f of initialFacts) {
    wm.addItem('fact', f.text, f.priority);
  }
  wm.addItem('tool_result', 'Stale debug payload: ' + 'A'.repeat(400));

  console.log(`Токенів до компактифікації: ${wm.getTotalTokens()} (Поріг: ${300 * 0.75})`);
  const metrics = wm.compact();
  console.log(`Токенів після компактифікації: ${metrics.afterTokens}`);
  console.log(`Коефіцієнт скорочення: ${(metrics.reductionRatio * 100).toFixed(1)}%`);
  console.log(
    `Критичні факти: ${metrics.criticalPreservedCount}/${metrics.criticalTotalCount} (${((metrics.criticalPreservedCount / metrics.criticalTotalCount) * 100).toFixed(1)}% збережено)`,
  );
  console.log(
    `Вторинні факти: ${metrics.secondaryPreservedCount}/${metrics.secondaryTotalCount} (${((metrics.secondaryPreservedCount / metrics.secondaryTotalCount) * 100).toFixed(1)}% збережено)`,
  );

  // 2. Deep Research Multi-Step Session
  console.log('\n--- 2. DEEP RESEARCH MULTI-STEP SESSION ---');
  const store = new JsonPersistentMemoryStore();
  const engine = new DeepResearchEngine(store, 2000, 0.75);

  const topic = 'Brownfield Production Multi-Agent Systems';
  const result = await engine.executeResearch(topic);

  console.log(`Тема: ${result.topic}`);
  console.log(`Кількість досліджених підтем: ${result.subtopicResults.length}`);
  console.log(`Кількість фактів у довгостроковій пам'яті: ${result.persistentFactsCount}`);
  console.log('\nДинаміка контексту по кроках:');
  console.table(result.contextTrace);

  console.log('\nФінальний консолідований звіт:');
  console.log(result.consolidatedReport);
}

main().catch(console.error);
