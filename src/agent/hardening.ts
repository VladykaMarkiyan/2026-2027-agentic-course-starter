/**
 * HARDENING LAYER — ЛР4, Крок 06
 *
 * Три рівні захисту продакшн-пайплайну:
 * 1. OTel-інструментація — span-трасування кожного агентського виклику
 *    з propagation W3C traceparent → trace_id у кожному виводі.
 * 2. Spend Limit Guard — відхиляє виклики, що перевищують USD-бюджет
 *    за допомогою token-based оцінки до фактичного запуску.
 * 3. Secret Leak Checker — сканує вихідні рядки на API-ключі, токени,
 *    паролі (sk-..., Bearer ..., ghp_..., AKIA...).
 */

// ─────────────────────────── OTel Трасування ───────────────────────────

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | undefined;
  readonly operationName: string;
  readonly startTime: number;       // ms since epoch
  endTime?: number | undefined;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
}

export interface SpanEvent {
  readonly name: string;
  readonly time: number;
  readonly attributes?: Record<string, string | number | boolean> | undefined;
}

/** W3C traceparent format: 00-{traceId}-{spanId}-01 */
export interface TraceContext {
  readonly traceparent: string;
  readonly traceId: string;
  readonly spanId: string;
}

/** Lightweight deterministic ID generator (not crypto-safe; for testing). */
function makeId(len: number): string {
  let id = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < len; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function generateTraceContext(parentTraceId?: string): TraceContext {
  const traceId = parentTraceId ?? makeId(32);
  const spanId  = makeId(16);
  return {
    traceparent: `00-${traceId}-${spanId}-01`,
    traceId,
    spanId,
  };
}

/** Minimal in-process span recorder (replaces full OTel SDK for unit tests). */
export class SpanRecorder {
  private readonly _spans: Span[] = [];

  startSpan(
    operationName: string,
    parentCtx?: TraceContext,
    attributes: Record<string, string | number | boolean> = {},
  ): Span & { end: (status?: 'ok' | 'error') => void } {
    const ctx = generateTraceContext(parentCtx?.traceId);
    const span: Span = {
      traceId:      ctx.traceId,
      spanId:       ctx.spanId,
      ...(parentCtx ? { parentSpanId: parentCtx.spanId } : {}),
      operationName,
      startTime:    Date.now(),
      status:       'ok',
      attributes:   { ...attributes },
      events:       [],
    };
    this._spans.push(span);

    const end = (status: 'ok' | 'error' = 'ok') => {
      span.endTime = Date.now();
      span.status  = status;
    };

    return Object.assign(span, { end });
  }

  addEvent(span: Span, name: string, attributes?: Record<string, string | number | boolean>): void {
    span.events.push({
      name,
      time: Date.now(),
      ...(attributes ? { attributes } : {}),
    });
  }

  spans(): readonly Span[] {
    return this._spans;
  }

  clear(): void {
    this._spans.length = 0;
  }

  /** Find the first span by operation name. */
  findByOperation(name: string): Span | undefined {
    return this._spans.find(s => s.operationName === name);
  }
}

/** Global recorder (singleton for in-process tests; production would use OTel SDK). */
export const globalSpanRecorder = new SpanRecorder();

// ─────────────────────────── Spend Limit Guard ───────────────────────────

export const USD_PER_1K_TOKENS = 0.0001;

export interface SpendLimitConfig {
  /** Hard cap in USD for the entire pipeline invocation. */
  readonly maxUsd: number;
  /** Estimated token count for a pending call (pre-flight). */
  readonly estimatedTokens: number;
  /** Already-consumed tokens this session. */
  readonly consumedTokens: number;
}

export interface SpendCheckResult {
  readonly allowed: boolean;
  readonly estimatedTotalUsd: number;
  readonly maxUsd: number;
  readonly reason?: string | undefined;
}

export function checkSpendLimit(config: SpendLimitConfig): SpendCheckResult {
  const { maxUsd, estimatedTokens, consumedTokens } = config;
  const totalTokens      = consumedTokens + estimatedTokens;
  const estimatedTotalUsd = (totalTokens / 1000) * USD_PER_1K_TOKENS;

  if (estimatedTotalUsd > maxUsd) {
    return {
      allowed: false,
      estimatedTotalUsd,
      maxUsd,
      reason: `Spend limit exceeded: estimated $${estimatedTotalUsd.toFixed(6)} > max $${maxUsd.toFixed(6)} (${totalTokens} tokens)`,
    };
  }

  return { allowed: true, estimatedTotalUsd, maxUsd };
}

/** Wrapper: instrument an async pipeline call with OTel span + spend guard. */
export async function instrumentedCall<T>(opts: {
  operationName: string;
  parentCtx?: TraceContext | undefined;
  estimatedTokens: number;
  spendLimitUsd: number;
  consumedTokens: number;
  recorder?: SpanRecorder | undefined;
  fn: (ctx: TraceContext) => Promise<T>;
}): Promise<{ result: T; ctx: TraceContext } | { error: string; ctx: TraceContext }> {
  const recorder = opts.recorder ?? globalSpanRecorder;
  const ctx      = generateTraceContext(opts.parentCtx?.traceId);

  // Pre-flight spend check
  const spendCheck = checkSpendLimit({
    maxUsd:          opts.spendLimitUsd,
    estimatedTokens: opts.estimatedTokens,
    consumedTokens:  opts.consumedTokens,
  });

  const span = recorder.startSpan(opts.operationName, opts.parentCtx, {
    traceId:         ctx.traceId,
    estimatedTokens: opts.estimatedTokens,
    spendLimitUsd:   opts.spendLimitUsd,
    consumedTokens:  opts.consumedTokens,
  });

  if (!spendCheck.allowed) {
    recorder.addEvent(span, 'spend_limit_exceeded', {
      estimatedTotalUsd: spendCheck.estimatedTotalUsd,
      maxUsd:            spendCheck.maxUsd,
    });
    span.end('error');
    return { error: spendCheck.reason ?? 'Spend limit exceeded', ctx };
  }

  try {
    const result = await opts.fn(ctx);
    span.end('ok');
    return { result, ctx };
  } catch (err) {
    recorder.addEvent(span, 'exception', {
      message: err instanceof Error ? err.message : String(err),
    });
    span.end('error');
    return { error: err instanceof Error ? err.message : String(err), ctx };
  }
}

// ─────────────────────────── Secret Leak Checker ───────────────────────────

export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly severity: 'critical' | 'high' | 'medium';
}

/** Well-known secret patterns. */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'OpenAI API Key',       pattern: /sk-[A-Za-z0-9]{20,}/g,                severity: 'critical' },
  { name: 'Bearer Token',         pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,     severity: 'high'     },
  { name: 'GitHub PAT',           pattern: /ghp_[A-Za-z0-9]{36}/g,                severity: 'critical' },
  { name: 'AWS Access Key',       pattern: /AKIA[0-9A-Z]{16}/g,                   severity: 'critical' },
  { name: 'Generic API Key',      pattern: /api[_-]?key\s*[:=]\s*["']?[^\s"']{8,}/gi, severity: 'medium' },
  { name: 'Private Key Header',   pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g, severity: 'critical' },
  { name: 'Google OAuth Token',   pattern: /ya29\.[A-Za-z0-9\-_]{20,}/g,          severity: 'critical' },
  { name: 'Slack Token',          pattern: /xox[baprs]-[0-9A-Za-z\-]{10,}/g,      severity: 'high'     },
];

export interface SecretFinding {
  readonly patternName: string;
  readonly severity: SecretPattern['severity'];
  readonly redacted: string;    // the matched text with middle chars replaced
}

export interface SecretScanResult {
  readonly clean: boolean;
  readonly findings: readonly SecretFinding[];
}

function redact(match: string): string {
  if (match.length <= 8) return '***';
  return match.slice(0, 4) + '*'.repeat(match.length - 8) + match.slice(-4);
}

export function scanForSecrets(text: string): SecretScanResult {
  const findings: SecretFinding[] = [];

  for (const { name, pattern, severity } of SECRET_PATTERNS) {
    // Reset lastIndex to avoid stateful RegExp issues
    const freshPattern = new RegExp(pattern.source, pattern.flags);
    const matches = [...text.matchAll(freshPattern)];
    for (const m of matches) {
      findings.push({
        patternName: name,
        severity,
        redacted: redact(m[0]),
      });
    }
  }

  return {
    clean: findings.length === 0,
    findings,
  };
}

/** Sanitize a string: replace any detected secrets with [REDACTED:<pattern>]. */
export function sanitizeOutput(text: string): string {
  let result = text;
  for (const { name, pattern } of SECRET_PATTERNS) {
    const freshPattern = new RegExp(pattern.source, pattern.flags);
    result = result.replace(freshPattern, `[REDACTED:${name}]`);
  }
  return result;
}
