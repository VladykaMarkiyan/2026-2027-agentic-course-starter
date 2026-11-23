# Step 07 — Single-Run Cost Audit

## Мета

Запустити повний мультиагентний пайплайн з реалістичними мок-даними та зафіксувати
точні кількості токенів і USD-вартість кожного компонента.

Скрипт: [`scripts/run-cost-audit.ts`](../../scripts/run-cost-audit.ts)

---

## Конфігурація Аудиту

| Параметр | Значення |
|----------|----------|
| Модель (обидва агенти) | `gemini-flash` (illustrative flash-tier) |
| Researcher: кількість turns | 2 |
| Researcher: tokens/turn input | 256 |
| Researcher: tokens/turn output | 512 |
| Synthesizer: кількість turns | 1 |
| Synthesizer: tokens/turn input | 768 |
| Synthesizer: tokens/turn output | 384 |
| Мультимодальний вхід | Зображення 1024×768 + Аудіо 60 секунд |
| Memory compaction cycles | 2 × 50 tokens overhead |
| Memory persistent facts | 6 × 20 tokens overhead |
| OTel spans | 4 × 10 tokens metadata |
| Budget limit | \$0.01 per pipeline run |

---

## Результати Аудиту

### Деталізація по компонентах

| Компонент | Деталь | Tokens | USD |
|-----------|--------|--------|-----|
| **Researcher** | Input: 2 turns × 256 | 512 | \$0.000051 |
| | Output: 2 turns × 512 | 1,024 | \$0.000102 |
| | **SUBTOTAL** | **1,536** | **\$0.000154** |
| **Synthesizer** | Input: 1 turn × 768 | 768 | \$0.000077 |
| | Output: 1 turn × 384 | 384 | \$0.000038 |
| | **SUBTOTAL** | **1,152** | **\$0.000115** |
| **Multimodal** | Image 1024×768 (85 + 4 tiles × 170) | 765 | \$0.000077 |
| | Audio 60s (60 × 25 tokens/s) | 1,500 | \$0.000150 |
| | **SUBTOTAL** | **2,265** | **\$0.000227** |
| **Memory Layer** | Compaction: 2 × 50 tokens | 100 | \$0.000010 |
| | Persistence: 6 facts × 20 tokens | 120 | \$0.000012 |
| | **SUBTOTAL** | **220** | **\$0.000022** |
| **OTel/Instrumentation** | 4 spans × 10 tokens metadata | 40 | \$0.000004 |
| | **SUBTOTAL** | **40** | **\$0.000004** |
| | | | |
| 🔢 **GRAND TOTAL** | | **5,213** | **\$0.000521** |

---

## Формули Розрахунку

### Загальна формула
```
USD = (totalTokens / 1000) × $0.0001
```

### Зображення (Vision Tiling)
```
tokens = 85 + ceil(W/512) × ceil(H/512) × 170
1024×768: 85 + ceil(1024/512) × ceil(768/512) × 170
        = 85 + 2 × 2 × 170 = 85 + 680 = 765 tokens
```

### Аудіо
```
tokens = durationSeconds × 25 tokens/s
60s: 60 × 25 = 1500 tokens
```

---

## Порівняння з Бюджетом

| Показник | Значення |
|----------|----------|
| Grand Total | **5,213 tokens** |
| Grand Total USD | **\$0.000521** |
| Budget Limit | \$0.0100 |
| Budget Used | **5.21%** |
| Status | ✅ **WITHIN BUDGET** |

> [!TIP]
> При поточній конфігурації пайплайн використовує ~5% бюджету. Ліміт \$0.01
> дозволяє витримати ~19x зростання навантаження до перевищення.

---

## OTel Span Summary

Два span-и у межах одного traceId (W3C traceparent propagation):

```
traceId: c7faab5e912aa42f3c01596a1b9ba75c

  [OK] researcher.call
       spanId:  3de33dfe9a2fd256
       parent:  1391c8f459ce9dd1   ← root span

  [OK] synthesizer.call
       spanId:  83060f502a2243e2
       parent:  1391c8f459ce9dd1   ← root span
```

Обидва агенти корельовані через спільний `traceId` — це забезпечує кореляцію логів.

---

## Висновки

1. **Агенти (Researcher + Synthesizer)** разом становлять **52.8%** загальної вартості (2,688 / 5,213 tokens).
2. **Мультимодальний вхід** — **43.5%** (2,265 / 5,213 tokens). Аудіо (1,500 tokens) домінує над зображенням (765 tokens).
3. **Memory + OTel overhead** — разом лише **3.7%** (260 / 5,213 tokens). Мінімальний вплив.
4. **Spend limit guard** спрацював коректно: \$0.000521 << \$0.01 → `✅ WITHIN BUDGET`.

---

## Скрипт

```bash
npx tsx scripts/run-cost-audit.ts
```

Результати детерміновані (не залежать від випадкових чисел) і відтворювані на будь-якій машині.
