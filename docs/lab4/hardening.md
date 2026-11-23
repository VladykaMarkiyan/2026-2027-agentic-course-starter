# Step 06 — Hardening: OTel Телеметрія, Spend Limits & Secret Leak Check

## Мета

Захистити продакшн-пайплайн трьома рівнями hardening:
1. **OTel-інструментація** — span-трасування кожного агентського виклику з W3C traceparent propagation.
2. **Spend Limit Guard** — відхиляє виклики, що перевищують USD-бюджет, до їх фактичного запуску.
3. **Secret Leak Checker** — сканує вихідні рядки на API-ключі, токени, паролі.

---

## Архітектура

```mermaid
flowchart TD
    A["instrumentedCall()"] --> B{Spend Check\ncheckSpendLimit()}
    B -- allowed --> C["SpanRecorder.startSpan()"]
    C --> D["fn(ctx: TraceContext)"]
    D --> E["span.end('ok')"]
    D -- throws --> F["span.end('error')"]
    B -- exceeded --> G["span.end('error')\nreturn { error }"]

    H["Output String"] --> I["scanForSecrets()"]
    I -- clean --> J["{ clean: true }"]
    I -- found --> K["{ clean: false, findings[] }"]
    K --> L["sanitizeOutput()\n→ [REDACTED:...]"]
```

---

## 1. OTel Span Instrumentation

### TraceContext (W3C traceparent)

```
traceparent: 00-{traceId:32hex}-{spanId:16hex}-01
```

| Поле | Довжина | Опис |
|------|---------|------|
| `traceId` | 32 hex chars | Єдиний для всього pipeline-виклику |
| `spanId` | 16 hex chars | Унікальний для кожного span |
| `parentSpanId` | 16 hex chars | spanId батьківського span (опційно) |

### Propagation

```
Root call:  generateTraceContext()           → { traceId: "aaa...", spanId: "bbb..." }
  Child:    generateTraceContext(traceId)    → { traceId: "aaa...", spanId: "ccc..." }
  Child:    generateTraceContext(traceId)    → { traceId: "aaa...", spanId: "ddd..." }
```

Researcher і Synthesizer отримують **один** traceId, різні spanId — це забезпечує кореляцію логів.

### SpanRecorder API

```ts
const recorder = new SpanRecorder();
const span = recorder.startSpan('researcher.call', parentCtx, { model: 'gemini-flash' });
recorder.addEvent(span, 'spend_limit_checked', { allowed: true });
span.end('ok');  // або 'error'
```

---

## 2. Spend Limit Guard

### Формула

```
totalTokens = consumedTokens + estimatedTokens
estimatedTotalUsd = (totalTokens / 1000) × $0.0001

if estimatedTotalUsd > maxUsd  →  blocked
```

### SpendCheckResult

```ts
{
  allowed: boolean;
  estimatedTotalUsd: number;
  maxUsd: number;
  reason?: string;   // тільки при blocked
}
```

### Поведінка при перевищенні

- `fn()` **ніколи не викликається** (pre-flight check).
- Span записується зі статусом `'error'`.
- Подія `spend_limit_exceeded` додається до span.events.
- Повертається `{ error: "Spend limit exceeded: ...", ctx }`.

---

## 3. Secret Leak Checker

### Таблиця Патернів

| Pattern Name | Regex (скорочено) | Severity |
|---|---|---|
| OpenAI API Key | `sk-[A-Za-z0-9]{20,}` | 🔴 critical |
| Bearer Token | `Bearer\s+[A-Za-z0-9...]+` | 🟠 high |
| GitHub PAT | `ghp_[A-Za-z0-9]{36}` | 🔴 critical |
| AWS Access Key | `AKIA[0-9A-Z]{16}` | 🔴 critical |
| Generic API Key | `api[_-]?key\s*[:=]\s*...{8,}` | 🟡 medium |
| Private Key Header | `-----BEGIN (RSA\|EC )?PRIVATE KEY-----` | 🔴 critical |
| Google OAuth Token | `ya29\.[A-Za-z0-9\-_]{20,}` | 🔴 critical |
| Slack Token | `xox[baprs]-[0-9A-Za-z\-]{10,}` | 🟠 high |

### Redaction

```ts
scanForSecrets(text)   // → { clean: boolean, findings: SecretFinding[] }
sanitizeOutput(text)   // → рядок з [REDACTED:<patternName>] замість секретів
```

Redact-формат: зберігає перші 4 та останні 4 символи, середина замінюється `***`.

---

## Результати Тестів

```
 ✓ tests/hardening.test.ts (14 tests) 7ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  237ms
```

TypeScript `tsc --noEmit` — **0 помилок** ✅

### Деталі тестів

| # | Група | Сценарій | Результат |
|---|-------|----------|-----------|
| 1 | OTel | Span створено з правильним traceId та operationName | ✅ PASSED |
| 2 | OTel | traceId propagated від батька до нащадка (W3C traceparent) | ✅ PASSED |
| 3 | OTel | Events додаються до span | ✅ PASSED |
| 4 | OTel | `instrumentedCall` створює span, повертає result | ✅ PASSED |
| 5 | Spend | Виклик у межах бюджету — дозволено | ✅ PASSED |
| 6 | Spend | Виклик перевищує бюджет — заблоковано | ✅ PASSED |
| 7 | Spend | `instrumentedCall` зупиняється при spend limit, fn не викликається | ✅ PASSED |
| 8 | Secrets | OpenAI API key `sk-...` виявлено (severity: critical) | ✅ PASSED |
| 9 | Secrets | Bearer token виявлено | ✅ PASSED |
| 10 | Secrets | AWS Access Key `AKIA...` виявлено (severity: critical) | ✅ PASSED |
| 11 | Secrets | GitHub PAT `ghp_...` виявлено (severity: critical) | ✅ PASSED |
| 12 | Secrets | Чистий вивід не має findings | ✅ PASSED |
| 13 | Secrets | `sanitizeOutput` замінює секрети на `[REDACTED:...]` | ✅ PASSED |
| 14 | Secrets | Всі SECRET_PATTERNS мають name, pattern, severity | ✅ PASSED |

---

## Файли

| Файл | Призначення |
|------|-------------|
| [`src/agent/hardening.ts`](../../src/agent/hardening.ts) | OTel spans, Spend limit guard, Secret scanner |
| [`tests/hardening.test.ts`](../../tests/hardening.test.ts) | 14 тестів (4 OTel + 3 Spend + 7 Secrets) |
