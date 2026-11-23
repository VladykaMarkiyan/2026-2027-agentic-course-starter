# Step 05 — Мультимодальний вхід: Валідація, Нормалізація та Оцінка Вартості

## Мета

Забезпечити безпечне прийняття зображень, аудіо та документів у мультиагентний пайплайн:
валідувати формат і розмір, виявляти пошкоджені файли через magic bytes, нормалізувати
(ресайз / обрізка), оцінювати кількість токенів і вартість обробки.

---

## Архітектура

```
MediaInput (filename, mimeType, sizeBytes, data: Uint8Array | base64)
     │
     ▼
 validateMedia()          ← MIME allowlist + size limits + magic bytes
     │  ValidationResult { status, mediaType, estimatedTokens, estimatedCostUsd, reason? }
     ▼
 normalizeMedia()         ← resize image tiles / truncate audio / trim doc
     │  NormalizedMedia { ...input, normalizedData, wasModified, originalSizeBytes }
     ▼
 processMultimodalInput() ← orchestrator: validate → normalize → cost summary
     │  ProcessingResult { valid, normalizedInputs[], totalTokens, totalCostUsd, errors[] }
     ▼
 Agent pipeline (multiagent.ts)
```

---

## Підтримувані MIME-типи

| Категорія | MIME-типи | Ліміт розміру |
|-----------|-----------|---------------|
| Зображення | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | **10 MB** |
| Аудіо | `audio/mp3`, `audio/mpeg`, `audio/wav`, `audio/webm`, `audio/ogg` | **25 MB** |
| Документи | `text/plain`, `application/pdf` | **5 MB** |

---

## Magic Bytes Валідація

Валідатор зчитує перші байти `Uint8Array` щоб виявити пошкоджені або підмінені файли:

| MIME | Сигнатура | Байти |
|------|-----------|-------|
| `image/jpeg` | `FF D8 FF` | `[0xff, 0xd8, 0xff]` |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` | `[0x89, 0x50, 0x4e, 0x47, ...]` |
| `audio/mp3` / `audio/mpeg` | `ID3` або `FF Ex` sync bits | `[0x49, 0x44, 0x33]` або `0xFF & 0xE0` |
| `audio/wav` | `RIFF` | `[0x52, 0x49, 0x46, 0x46]` |
| Решта | — | trust MIME (webp, ogg, pdf, text…) |

---

## Оцінка Токенів

### Зображення (OpenAI Vision-style тайлінг)

$$\text{tokens} = 85 + \left\lceil\frac{W}{512}\right\rceil \times \left\lceil\frac{H}{512}\right\rceil \times 170$$

```
IMAGE_BASE_TOKENS   = 85
IMAGE_TILE_TOKENS   = 170
IMAGE_TILE_PX       = 512
```

Приклад 1024×768:
- `ceil(1024/512) = 2`, `ceil(768/512) = 2` → 4 тайли
- **tokens = 85 + 4 × 170 = 765**

### Аудіо

```
AUDIO_TOKENS_PER_SEC = 25 tokens/s
tokens = durationSeconds × 25
```

При невідомій тривалості: `estimateAudioTokens(sizeBytes)` → `ceil(sizeBytes / 16000) × 25`

### Документи

```
tokens = ceil(sizeBytes / 4)   // approx 4 bytes per token
```

---

## Формула Вартості

```
MULTIMODAL_INPUT_PRICE_PER_1K = $0.0001 per 1000 tokens

cost = (tokens / 1000) × $0.0001
```

---

## 4 Обов'язкові Сценарії

| # | Сценарій | Вхід | Очікуваний результат | Результат тесту |
|---|----------|------|----------------------|-----------------|
| 1 | **Image OK** | `image/jpeg`, 500 KB, валідний JPEG header (`FF D8 FF`) | `status: "ok"`, `mediaType: "image"`, `estimatedTokens > 0` | ✅ PASSED |
| 2 | **Audio OK** | `audio/wav`, 1 MB, валідний WAV header (`RIFF`) | `status: "ok"`, `mediaType: "audio"`, `estimatedTokens > 0` | ✅ PASSED |
| 3 | **Corrupted file** | `image/jpeg`, 500 KB, випадкові байти (не FF D8 FF) | `status: "corrupted"`, `reason` містить "magic bytes" | ✅ PASSED |
| 4 | **Oversized file** | `image/jpeg`, **11 MB** (понад 10 MB ліміт) | `status: "too_large"`, `reason` містить розмір | ✅ PASSED |

---

## Додаткові Сценарії

| # | Сценарій | Деталь | Результат |
|---|----------|--------|-----------|
| 5 | **Image resize** | `processMultimodalInput` на 1024×768 JPEG → `normalizeMedia` обрізає до 512×512 | ✅ PASSED |
| 6 | **Audio truncation** | Аудіо > MAX_AUDIO_BYTES truncated, `wasModified: true` | ✅ PASSED |
| 7 | **Unsupported MIME** | `video/mp4` → `status: "unsupported_type"` | ✅ PASSED |
| 8 | **Cost calculation** | `tokensToUsd(1000) === 0.0001` | ✅ PASSED |

---

## Результати Тестів

```
 ✓ tests/multimodal.test.ts (8 tests) 4ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  216ms
```

TypeScript `tsc --noEmit` — **0 помилок** ✅

---

## Файли

| Файл | Призначення |
|------|-------------|
| [`src/agent/multimodal.ts`](../../src/agent/multimodal.ts) | Валідація, нормалізація, оцінка токенів / вартості |
| [`tests/multimodal.test.ts`](../../tests/multimodal.test.ts) | 8 unit-тестів (4 обов'язкові + 4 додаткові) |
