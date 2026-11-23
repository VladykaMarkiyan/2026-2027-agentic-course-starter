/**
 * Скрипт фіксації результатів трьох тестових прогонів мультиагентного пайплайну (ЛР4, Крок 03).
 */

import {
  runMultiAgentPipeline,
  DEFAULT_PIPELINE_BUDGET,
  type ResearcherExecutor,
  type SynthesizerExecutor,
  type PipelineBudget,
} from '../src/agent/multiagent';

async function main() {
  console.log('=== MULTI-AGENT PIPELINE TEST SUITE (3 RUNS) ===\n');

  const validResearchContract = {
    topic: 'TypeScript Brownfield Modernization',
    findings: [
      {
        fact: 'Defu provides prototype-safe object merging without runtime dependencies.',
        source: 'docs/lab4/context.md#L45',
        confidence: 0.98,
      },
      {
        fact: 'Characterization tests caught 3 subtle quirks before refactoring.',
        source: 'docs/lab4/characterization.md#L20',
        confidence: 0.95,
      },
    ],
    hypotheses: ['Adding array deduplication will not break backward compatibility'],
    summary: 'The library is well-tested and safe for modular extensions.',
  };

  const validSynthesisResult = {
    topic: 'TypeScript Brownfield Modernization',
    executiveSummary:
      'Brownfield modernization was verified successfully using golden master tests.',
    verifiedKeyPoints: [
      'Zero production bugs introduced',
      'Rollback verified in under 5 seconds',
    ],
    recommendation: 'Deploy defuDedup to production release cycle.',
    confidenceScore: 0.96,
  };

  // ---------------------------------------------------------
  // ПРОГІН 1: Нормальний успішний запуск
  // ---------------------------------------------------------
  console.log('--- ПРОГІН 1: Нормальний прогін (успішне виконання обох агентів) ---');
  let time1 = 1000;
  const clock1 = () => time1;

  const res1 = await runMultiAgentPipeline(
    'TypeScript Brownfield Modernization',
    async () => {
      time1 += 420;
      return {
        turns: 2,
        usage: { inputTokens: 1200, cachedTokens: 0, outputTokens: 350 },
        contract: validResearchContract,
      };
    },
    async () => {
      time1 += 310;
      return {
        turns: 1,
        usage: { inputTokens: 950, cachedTokens: 0, outputTokens: 280 },
        synthesis: validSynthesisResult,
      };
    },
    DEFAULT_PIPELINE_BUDGET,
    clock1,
  );

  console.log('Результат 1:', JSON.stringify(res1, null, 2));

  // ---------------------------------------------------------
  // ПРОГІН 2: Перевищення бюджету токенів першим агентом
  // ---------------------------------------------------------
  console.log('\n--- ПРОГІН 2: Перевищення бюджету (спрацювання Short-Circuit) ---');
  let time2 = 2000;
  const clock2 = () => time2;

  let synthesizerCalled2 = false;
  const res2 = await runMultiAgentPipeline(
    'Large Knowledge Ingestion',
    async () => {
      time2 += 550;
      return {
        turns: 3,
        usage: { inputTokens: 14500, cachedTokens: 0, outputTokens: 520 }, // 14500 > 10000 limit
        contract: validResearchContract,
      };
    },
    async () => {
      synthesizerCalled2 = true;
      return {
        turns: 1,
        usage: { inputTokens: 500, cachedTokens: 0, outputTokens: 100 },
        synthesis: validSynthesisResult,
      };
    },
    DEFAULT_PIPELINE_BUDGET,
    clock2,
  );

  console.log('Synthesizer був викликаний?:', synthesizerCalled2 ? 'ТАК (Помилка!)' : 'НІ (Short-Circuit успішний)');
  console.log('Результат 2:', JSON.stringify(res2, null, 2));

  // ---------------------------------------------------------
  // ПРОГІН 3: Аварійне завершення через таймаут пайплайну
  // ---------------------------------------------------------
  console.log('\n--- ПРОГІН 3: Таймаут пайплайну (Emergency Timeout) ---');
  let time3 = 3000;
  const clock3 = () => time3;

  const tightBudget: PipelineBudget = {
    maxResearcherTurns: 5,
    maxSynthesizerTurns: 3,
    maxInputTokens: 10000,
    maxOutputTokens: 2000,
    timeoutMs: 1000, // 1 секунда ліміт
  };

  let synthesizerCalled3 = false;
  const res3 = await runMultiAgentPipeline(
    'Deep Exhaustive Crawl',
    async () => {
      time3 += 1500; // 1500ms > 1000ms limit!
      return {
        turns: 2,
        usage: { inputTokens: 800, cachedTokens: 0, outputTokens: 200 },
        contract: validResearchContract,
      };
    },
    async () => {
      synthesizerCalled3 = true;
      return {
        turns: 1,
        usage: { inputTokens: 400, cachedTokens: 0, outputTokens: 100 },
        synthesis: validSynthesisResult,
      };
    },
    tightBudget,
    clock3,
  );

  console.log('Synthesizer був викликаний?:', synthesizerCalled3 ? 'ТАК (Помилка!)' : 'НІ (Short-Circuit успішний)');
  console.log('Результат 3:', JSON.stringify(res3, null, 2));
}

main().catch(console.error);
