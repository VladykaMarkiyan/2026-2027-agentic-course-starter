/**
 * Cost Audit Script — ЛР4, Крок 07
 *
 * Запускає повний пайплайн з реалістичними мок-даними і збирає точні
 * Token-counts + USD-вартість для кожного компонента.
 *
 * Запуск: npx tsx scripts/run-cost-audit.ts
 */

import {
  SpanRecorder,
  generateTraceContext,
  checkSpendLimit,
  USD_PER_1K_TOKENS,
} from '../src/agent/hardening';
import {
  estimateImageTokens,
  estimateAudioTokens,
  tokensToUsd,
  MULTIMODAL_INPUT_PRICE_PER_1K,
} from '../src/agent/multimodal';

// ─────────────────────────── Helpers ───────────────────────────

function tokUsd(tokens: number): string {
  return `$${((tokens / 1000) * USD_PER_1K_TOKENS).toFixed(6)}`;
}

function header(title: string): void {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function row(label: string, tokens: number): void {
  const usd = (tokens / 1000) * USD_PER_1K_TOKENS;
  console.log(
    `  ${label.padEnd(35)} ${String(tokens).padStart(8)} tokens   $${usd.toFixed(6)}`
  );
}

// ─────────────────────────── Mock Pipeline ───────────────────────────

const recorder = new SpanRecorder();
const rootCtx  = generateTraceContext();

header('COST AUDIT — Full Pipeline Run');
console.log(`  Trace ID: ${rootCtx.traceId}`);

// ── 1. Researcher Agent ──────────────────────────────────────────
// Mock: 2 turns × (256 input + 512 output) tokens each
const researcherInputTokens  = 2 * 256;
const researcherOutputTokens = 2 * 512;
const researcherTotal        = researcherInputTokens + researcherOutputTokens;

const researcherSpan = recorder.startSpan('researcher.call', rootCtx, {
  model: 'gemini-flash',
  turns: 2,
  inputTokens:  researcherInputTokens,
  outputTokens: researcherOutputTokens,
});
researcherSpan.end('ok');

header('1. Researcher Agent');
row('  Input (2 turns × 256 tokens)',  researcherInputTokens);
row('  Output (2 turns × 512 tokens)', researcherOutputTokens);
row('  SUBTOTAL Researcher',           researcherTotal);

// ── 2. Synthesizer Agent ─────────────────────────────────────────
// Mock: 1 turn × (768 input + 384 output) tokens
const synthInputTokens  = 768;
const synthOutputTokens = 384;
const synthTotal        = synthInputTokens + synthOutputTokens;

const synthSpan = recorder.startSpan('synthesizer.call', rootCtx, {
  model: 'gemini-flash',
  turns: 1,
  inputTokens:  synthInputTokens,
  outputTokens: synthOutputTokens,
});
synthSpan.end('ok');

header('2. Synthesizer Agent');
row('  Input (1 turn × 768 tokens)',   synthInputTokens);
row('  Output (1 turn × 384 tokens)',  synthOutputTokens);
row('  SUBTOTAL Synthesizer',          synthTotal);

// ── 3. Multimodal Preprocessing ──────────────────────────────────
// Image: 1024×768 → estimateImageTokens(1024, 768)
// Audio: 60s → estimateAudioTokens(60 × 16000)
const imageTokens = estimateImageTokens(1024, 768);
const audioTokens = estimateAudioTokens(60);  // 60 seconds
const mmTotal     = imageTokens + audioTokens;

header('3. Multimodal Preprocessing');
row('  Image (1024×768)',              imageTokens);
row('  Audio (60s)',                    audioTokens);
row('  SUBTOTAL Multimodal',          mmTotal);
console.log(`  [NOTE] Price constant: $${MULTIMODAL_INPUT_PRICE_PER_1K} per 1k tokens`);

// ── 4. Memory Operations ──────────────────────────────────────────
// WorkingMemory: 2 compaction cycles × ~50 tokens overhead each
// PersistentStore: 6 facts × ~20 tokens serialization overhead each
const memoryCompactionTokens  = 2 * 50;
const memoryPersistenceTokens = 6 * 20;
const memoryTotal             = memoryCompactionTokens + memoryPersistenceTokens;

header('4. Memory Layer Overhead');
row('  Compaction (2 cycles × 50 tok)',   memoryCompactionTokens);
row('  Persistence (6 facts × 20 tok)',   memoryPersistenceTokens);
row('  SUBTOTAL Memory',                  memoryTotal);

// ── 5. OTel / Instrumentation ────────────────────────────────────
// Span metadata: ~10 tokens per span, 4 spans in this run
const otelTokens = 4 * 10;

header('5. OTel / Instrumentation Overhead');
row('  Span metadata (4 spans × 10 tok)', otelTokens);
row('  SUBTOTAL OTel',                    otelTokens);
console.log('  [NOTE] Negligible; recorded for completeness only.');

// ── 6. Grand Total ───────────────────────────────────────────────
const grandTotal = researcherTotal + synthTotal + mmTotal + memoryTotal + otelTokens;
const grandUsd   = (grandTotal / 1000) * USD_PER_1K_TOKENS;

header('GRAND TOTAL');
row('  Researcher',  researcherTotal);
row('  Synthesizer', synthTotal);
row('  Multimodal',  mmTotal);
row('  Memory',      memoryTotal);
row('  OTel',        otelTokens);
console.log('  ' + '─'.repeat(55));
row('  TOTAL',       grandTotal);
console.log(`\n  Grand Total USD: $${grandUsd.toFixed(6)}`);
console.log(`  tokensToUsd(${grandTotal}) = $${tokensToUsd(grandTotal).toFixed(6)}`);

// ── 7. Spend Limit Check ──────────────────────────────────────────
const BUDGET_USD = 0.01; // $0.01 per pipeline run
const spendCheck = checkSpendLimit({
  maxUsd:          BUDGET_USD,
  estimatedTokens: grandTotal,
  consumedTokens:  0,
});

header('7. Spend Limit Validation');
console.log(`  Budget:    $${BUDGET_USD.toFixed(4)}`);
console.log(`  Estimated: $${spendCheck.estimatedTotalUsd.toFixed(6)}`);
console.log(`  Status:    ${spendCheck.allowed ? '✅ WITHIN BUDGET' : '❌ EXCEEDS BUDGET'}`);

// ── 8. OTel Spans Summary ─────────────────────────────────────────
header('8. Recorded OTel Spans');
for (const s of recorder.spans()) {
  console.log(`  [${s.status.toUpperCase()}] ${s.operationName}`);
  console.log(`       traceId: ${s.traceId}`);
  console.log(`       spanId:  ${s.spanId}`);
  if (s.parentSpanId) console.log(`       parent:  ${s.parentSpanId}`);
}

console.log('\n' + '═'.repeat(60));
console.log('  Audit complete.');
console.log('═'.repeat(60) + '\n');
