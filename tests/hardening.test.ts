import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpanRecorder,
  generateTraceContext,
  checkSpendLimit,
  instrumentedCall,
  scanForSecrets,
  sanitizeOutput,
  SECRET_PATTERNS,
} from '../src/agent/hardening';

// ─────────────────────────── OTel / Span Tests ───────────────────────────

describe('OTel Span Instrumentation', () => {
  it('should create a span with correct traceId and operationName', () => {
    const recorder = new SpanRecorder();
    const span = recorder.startSpan('researcher.call', undefined, { model: 'gemini-flash' });

    expect(span.traceId).toHaveLength(32);
    expect(span.spanId).toHaveLength(16);
    expect(span.operationName).toBe('researcher.call');
    expect(span.attributes.model).toBe('gemini-flash');
    expect(span.status).toBe('ok');
    expect(span.endTime).toBeUndefined();

    span.end('ok');
    expect(span.endTime).toBeDefined();
    expect(span.status).toBe('ok');
    expect(recorder.spans()).toHaveLength(1);
  });

  it('should propagate traceId from parent to child span (W3C traceparent)', () => {
    const recorder = new SpanRecorder();
    const parentCtx = generateTraceContext();
    const child = recorder.startSpan('synthesizer.call', parentCtx);

    // Child shares parent traceId
    expect(child.traceId).toBe(parentCtx.traceId);
    // Child has its own spanId
    expect(child.spanId).not.toBe(parentCtx.spanId);
    // parentSpanId set correctly
    expect(child.parentSpanId).toBe(parentCtx.spanId);

    // W3C format: 00-{32}-{16}-01
    const parentTraceparent = parentCtx.traceparent;
    expect(parentTraceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('should record events on a span', () => {
    const recorder = new SpanRecorder();
    const span = recorder.startSpan('pipeline.run');
    recorder.addEvent(span, 'spend_limit_checked', { allowed: true });
    recorder.addEvent(span, 'agent_called', { agent: 'researcher' });

    expect(span.events).toHaveLength(2);
    expect(span.events[0]?.name).toBe('spend_limit_checked');
    expect(span.events[1]?.name).toBe('agent_called');
  });

  it('instrumentedCall should create a span and return result', async () => {
    const recorder = new SpanRecorder();
    const parentCtx = generateTraceContext();

    const outcome = await instrumentedCall({
      operationName:   'test.op',
      parentCtx,
      estimatedTokens: 100,
      spendLimitUsd:   1.0,
      consumedTokens:  0,
      recorder,
      fn: async (ctx) => {
        expect(ctx.traceId).toBe(parentCtx.traceId);
        return 'success';
      },
    });

    expect('result' in outcome).toBe(true);
    if ('result' in outcome) expect(outcome.result).toBe('success');

    const span = recorder.findByOperation('test.op');
    expect(span).toBeDefined();
    expect(span?.status).toBe('ok');
    expect(span?.endTime).toBeDefined();
  });
});

// ─────────────────────────── Spend Limit Tests ───────────────────────────

describe('Spend Limit Guard', () => {
  it('should allow a call within the budget', () => {
    const result = checkSpendLimit({
      maxUsd:          0.01,
      estimatedTokens: 1000,
      consumedTokens:  0,
    });
    // 1000 tokens × $0.0001/1k = $0.0001
    expect(result.allowed).toBe(true);
    expect(result.estimatedTotalUsd).toBeCloseTo(0.0001, 6);
  });

  it('should block a call that exceeds the budget', () => {
    const result = checkSpendLimit({
      maxUsd:          0.001,
      estimatedTokens: 100_000,  // $0.01 >> $0.001
      consumedTokens:  0,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Spend limit exceeded');
    expect(result.estimatedTotalUsd).toBeGreaterThan(result.maxUsd);
  });

  it('instrumentedCall should halt and return error when spend limit exceeded', async () => {
    const recorder = new SpanRecorder();

    let fnCalled = false;
    const outcome = await instrumentedCall({
      operationName:   'expensive.call',
      estimatedTokens: 1_000_000,  // $0.1
      spendLimitUsd:   0.001,
      consumedTokens:  0,
      recorder,
      fn: async () => {
        fnCalled = true;
        return 'should not reach';
      },
    });

    // fn must NOT have been called
    expect(fnCalled).toBe(false);
    expect('error' in outcome).toBe(true);
    if ('error' in outcome) expect(outcome.error).toContain('Spend limit exceeded');

    const span = recorder.findByOperation('expensive.call');
    expect(span?.status).toBe('error');
    expect(span?.events.some(e => e.name === 'spend_limit_exceeded')).toBe(true);
  });
});

// ─────────────────────────── Secret Leak Tests ───────────────────────────

describe('Secret Leak Checker', () => {
  it('should detect OpenAI API key', () => {
    const text = 'Using key sk-abcdefghijklmnopqrstuv1234567890xyz to call the API';
    const result = scanForSecrets(text);

    expect(result.clean).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some(f => f.patternName === 'OpenAI API Key')).toBe(true);
    expect(result.findings.some(f => f.severity === 'critical')).toBe(true);
  });

  it('should detect Bearer token', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const result = scanForSecrets(text);

    expect(result.clean).toBe(false);
    expect(result.findings.some(f => f.patternName === 'Bearer Token')).toBe(true);
  });

  it('should detect AWS Access Key', () => {
    const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE configured';
    const result = scanForSecrets(text);

    expect(result.clean).toBe(false);
    expect(result.findings.some(f => f.patternName === 'AWS Access Key')).toBe(true);
    expect(result.findings.some(f => f.severity === 'critical')).toBe(true);
  });

  it('should detect GitHub PAT', () => {
    const text = `token: ghp_${'A'.repeat(36)}`;
    const result = scanForSecrets(text);

    expect(result.clean).toBe(false);
    expect(result.findings.some(f => f.patternName === 'GitHub PAT')).toBe(true);
  });

  it('should pass clean output without findings', () => {
    const text = 'The result of the analysis is: temperature=0.7, maxTokens=2048';
    const result = scanForSecrets(text);

    expect(result.clean).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('should sanitize output by replacing secrets with [REDACTED:...]', () => {
    const text = 'Key: sk-abcdefghijklmnopqrstuvwxyz1234567890 and Bearer eyJfoo';
    const sanitized = sanitizeOutput(text);

    expect(sanitized).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(sanitized).toContain('[REDACTED:OpenAI API Key]');
    expect(sanitized).toContain('[REDACTED:Bearer Token]');
  });

  it('should cover all defined patterns in SECRET_PATTERNS', () => {
    // Verify that the constant is populated and readable
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(6);
    for (const p of SECRET_PATTERNS) {
      expect(p.name).toBeTruthy();
      expect(p.pattern).toBeInstanceOf(RegExp);
      expect(['critical', 'high', 'medium']).toContain(p.severity);
    }
  });
});
