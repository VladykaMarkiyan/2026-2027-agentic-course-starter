/**
 * МУЛЬТИМОДАЛЬНИЙ ВХІД У ПРОДУКТІ (ЛР4, Крок 05).
 *
 * Обробка зображень, аудіо та транскрипцій:
 * - Валідація MIME-типу, розміру та цілісності файлу (corrupted detection).
 * - Нормалізація: ресайз зображень, конвертація аудіо, обрізка тексту.
 * - Оцінка вартості обробки (token-based pricing для vision та audio).
 * - 4 чіткі сценарії: Image OK, Audio OK, Corrupted file, Oversized file.
 */

import { z } from 'zod';

// ─────────────────────────── Types ───────────────────────────

export type MediaType = 'image' | 'audio' | 'document';

export interface MediaInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly data: Uint8Array | string; // bytes or base64
}

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
export const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
]);
export const ALLOWED_DOC_TYPES = new Set([
  'text/plain',
  'application/pdf',
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;   // 10 MB
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;   // 25 MB
export const MAX_DOC_BYTES   = 5  * 1024 * 1024;   //  5 MB

// JPEG magic bytes: FF D8 FF
export const JPEG_MAGIC = [0xff, 0xd8, 0xff];
// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC  = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// MP3 / MPEG: ID3 or FF FB / FF F3 / FF F2
const MP3_MAGIC  = [0x49, 0x44, 0x33]; // "ID3"
// WAV: RIFF
const WAV_MAGIC  = [0x52, 0x49, 0x46, 0x46]; // "RIFF"

// ─────────────────────────── Pricing ───────────────────────────

/** Tokens per image tile (OpenAI-style vision: 85 base + 170/tile). */
export const IMAGE_BASE_TOKENS   = 85;
export const IMAGE_TILE_TOKENS   = 170;
export const IMAGE_TILE_PX       = 512;

/** Approx tokens per second for audio (Gemini: 25 tokens/s). */
export const AUDIO_TOKENS_PER_SEC = 25;

/** USD per 1000 tokens (illustrative flash-tier pricing). */
export const MULTIMODAL_INPUT_PRICE_PER_1K = 0.0001;

// ─────────────────────────── Validation Results ───────────────────────────

export type ValidationStatus =
  | 'ok'
  | 'unsupported_mime'
  | 'oversized'
  | 'corrupted'
  | 'empty';

export interface ValidationResult {
  readonly status: ValidationStatus;
  readonly mediaType?: MediaType;
  readonly errorMessage?: string;
}

export interface NormalizedMedia {
  readonly originalInput: MediaInput;
  readonly mediaType: MediaType;
  readonly estimatedTokens: number;
  readonly estimatedCostUsd: number;
  readonly normalizedSizeBytes: number;
  readonly wasResized: boolean;
  readonly transcriptHint?: string;
}

// ─────────────────────────── Validation ───────────────────────────

function detectMediaType(mimeType: string): MediaType | null {
  if (ALLOWED_IMAGE_TYPES.has(mimeType)) return 'image';
  if (ALLOWED_AUDIO_TYPES.has(mimeType)) return 'audio';
  if (ALLOWED_DOC_TYPES.has(mimeType))   return 'document';
  return null;
}

function maxBytesFor(type: MediaType): number {
  switch (type) {
    case 'image':    return MAX_IMAGE_BYTES;
    case 'audio':    return MAX_AUDIO_BYTES;
    case 'document': return MAX_DOC_BYTES;
  }
}

function checkMagicBytes(data: Uint8Array, mime: string): boolean {
  const check = (magic: number[]) =>
    magic.every((b, i) => data[i] === b);

  if (mime === 'image/jpeg') return check(JPEG_MAGIC);
  if (mime === 'image/png')  return check(PNG_MAGIC);
  if (mime === 'audio/mp3' || mime === 'audio/mpeg') {
    return check(MP3_MAGIC) || (data[0] === 0xff && (data[1] ?? 0) & 0xe0) === 0xe0;
  }
  if (mime === 'audio/wav') return check(WAV_MAGIC);
  // For mime types we don't have magic for (webp, ogg, pdf, text…) we trust the MIME
  return true;
}

export function validateMedia(input: MediaInput): ValidationResult {
  if (input.sizeBytes === 0) {
    return { status: 'empty', errorMessage: 'File is empty (0 bytes).' };
  }

  const mediaType = detectMediaType(input.mimeType);
  if (!mediaType) {
    return {
      status: 'unsupported_mime',
      errorMessage: `Unsupported MIME type: ${input.mimeType}`,
    };
  }

  if (input.sizeBytes > maxBytesFor(mediaType)) {
    return {
      status: 'oversized',
      mediaType,
      errorMessage: `File exceeds limit: ${input.sizeBytes} bytes > ${maxBytesFor(mediaType)} bytes allowed for ${mediaType}.`,
    };
  }

  // Magic byte check only for binary payloads
  if (input.data instanceof Uint8Array && input.data.length > 0) {
    if (!checkMagicBytes(input.data, input.mimeType)) {
      return {
        status: 'corrupted',
        mediaType,
        errorMessage: `File header does not match declared MIME type (${input.mimeType}). File may be corrupted or mislabelled.`,
      };
    }
  }

  return { status: 'ok', mediaType };
}

// ─────────────────────────── Token Estimation ───────────────────────────

export function estimateImageTokens(widthPx: number, heightPx: number): number {
  const tilesW = Math.ceil(widthPx / IMAGE_TILE_PX);
  const tilesH = Math.ceil(heightPx / IMAGE_TILE_PX);
  return IMAGE_BASE_TOKENS + tilesW * tilesH * IMAGE_TILE_TOKENS;
}

export function estimateAudioTokens(durationSeconds: number): number {
  return Math.ceil(durationSeconds * AUDIO_TOKENS_PER_SEC);
}

export function estimateDocTokens(sizeBytes: number): number {
  // Approx 1 token per 4 bytes of text content
  return Math.ceil(sizeBytes / 4);
}

export function tokensToUsd(tokens: number): number {
  return (tokens / 1000) * MULTIMODAL_INPUT_PRICE_PER_1K;
}

// ─────────────────────────── Normalization ───────────────────────────

export interface NormalizationOptions {
  /** Target width/height cap for image resize (default 1024px). */
  readonly maxImageDimensionPx?: number;
  /** Max audio clip duration in seconds for token control (default 60s). */
  readonly maxAudioDurationSec?: number;
  /** Max document chars to pass as context (default 8000 chars). */
  readonly maxDocChars?: number;
}

export function normalizeMedia(
  input: MediaInput,
  mediaType: MediaType,
  options: NormalizationOptions = {},
): NormalizedMedia {
  const {
    maxImageDimensionPx = 1024,
    maxAudioDurationSec = 60,
    maxDocChars = 8000,
  } = options;

  switch (mediaType) {
    case 'image': {
      // Simulate: derive (fake) pixel dimensions from file size (placeholder heuristic)
      const rawPx = Math.ceil(Math.sqrt(input.sizeBytes));
      const wasResized = rawPx > maxImageDimensionPx;
      const effectivePx = wasResized ? maxImageDimensionPx : rawPx;
      const tokens = estimateImageTokens(effectivePx, effectivePx);
      return {
        originalInput: input,
        mediaType: 'image',
        estimatedTokens: tokens,
        estimatedCostUsd: tokensToUsd(tokens),
        normalizedSizeBytes: wasResized
          ? Math.ceil(input.sizeBytes * (maxImageDimensionPx / rawPx) ** 2)
          : input.sizeBytes,
        wasResized,
      };
    }
    case 'audio': {
      // Heuristic: 128 kbps ≈ 16000 bytes/s
      const rawDuration = input.sizeBytes / 16000;
      const wasResized = rawDuration > maxAudioDurationSec;
      const effectiveDuration = wasResized ? maxAudioDurationSec : rawDuration;
      const tokens = estimateAudioTokens(effectiveDuration);
      return {
        originalInput: input,
        mediaType: 'audio',
        estimatedTokens: tokens,
        estimatedCostUsd: tokensToUsd(tokens),
        normalizedSizeBytes: wasResized
          ? Math.ceil(maxAudioDurationSec * 16000)
          : input.sizeBytes,
        wasResized,
        transcriptHint: `Audio clip of ~${Math.round(effectiveDuration)}s queued for transcription.`,
      };
    }
    case 'document': {
      const content = typeof input.data === 'string' ? input.data : new TextDecoder().decode(input.data);
      const truncated = content.slice(0, maxDocChars);
      const tokens = estimateDocTokens(truncated.length);
      return {
        originalInput: input,
        mediaType: 'document',
        estimatedTokens: tokens,
        estimatedCostUsd: tokensToUsd(tokens),
        normalizedSizeBytes: truncated.length,
        wasResized: content.length > maxDocChars,
        transcriptHint: truncated.slice(0, 120) + (content.length > 120 ? '…' : ''),
      };
    }
  }
}

// ─────────────────────────── Pipeline ───────────────────────────

export interface MultimodalProcessResult {
  readonly input: MediaInput;
  readonly validationResult: ValidationResult;
  readonly normalized?: NormalizedMedia;
  readonly accepted: boolean;
}

export function processMultimodalInput(
  input: MediaInput,
  options?: NormalizationOptions,
): MultimodalProcessResult {
  const validationResult = validateMedia(input);
  if (validationResult.status !== 'ok' || !validationResult.mediaType) {
    return { input, validationResult, accepted: false };
  }
  const normalized = normalizeMedia(input, validationResult.mediaType, options);
  return { input, validationResult, normalized, accepted: true };
}
