import { describe, it, expect } from 'vitest';
import {
  processMultimodalInput,
  validateMedia,
  estimateImageTokens,
  estimateAudioTokens,
  tokensToUsd,
  JPEG_MAGIC,
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  type MediaInput,
} from '../src/agent/multimodal';

// Helper: build a minimal JPEG header
function jpegBytes(extraBytes = 0): Uint8Array {
  const buf = new Uint8Array(3 + extraBytes);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf;
}

// Helper: build a minimal WAV header ("RIFF")
function wavBytes(extraBytes = 0): Uint8Array {
  const buf = new Uint8Array(4 + extraBytes);
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
  return buf;
}

describe('Multimodal Input Processing — 4 scenarios', () => {

  it('Scenario 1 (Image OK): accepts a valid JPEG, produces token & cost estimates, no resize needed', () => {
    // 200×200 JPEG ≈ 40 KB
    const imageData = jpegBytes(40_000 - 3);
    const input: MediaInput = {
      filename: 'screenshot.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: imageData.length,
      data: imageData,
    };

    const result = processMultimodalInput(input);

    expect(result.accepted).toBe(true);
    expect(result.validationResult.status).toBe('ok');
    expect(result.validationResult.mediaType).toBe('image');
    expect(result.normalized).toBeDefined();
    expect(result.normalized!.wasResized).toBe(false);
    expect(result.normalized!.estimatedTokens).toBeGreaterThan(0);
    expect(result.normalized!.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('Scenario 2 (Audio OK): accepts a valid WAV, estimates duration-based tokens and cost', () => {
    // 10-second clip at 128kbps ≈ 160 000 bytes
    const audioData = wavBytes(160_000 - 4);
    const input: MediaInput = {
      filename: 'meeting-clip.wav',
      mimeType: 'audio/wav',
      sizeBytes: audioData.length,
      data: audioData,
    };

    const result = processMultimodalInput(input);

    expect(result.accepted).toBe(true);
    expect(result.validationResult.status).toBe('ok');
    expect(result.validationResult.mediaType).toBe('audio');
    expect(result.normalized!.wasResized).toBe(false);
    // 10s × 25 tokens/s = 250 tokens
    expect(result.normalized!.estimatedTokens).toBeCloseTo(250, 0);
    expect(result.normalized!.transcriptHint).toContain('transcription');
  });

  it('Scenario 3 (Corrupted): rejects a file whose magic bytes mismatch the declared MIME type', () => {
    // PNG bytes masquerading as JPEG
    const pngAsPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(100).fill(0)]);
    const input: MediaInput = {
      filename: 'fake.jpg',
      mimeType: 'image/jpeg',  // lying about the type
      sizeBytes: pngAsPng.length,
      data: pngAsPng,
    };

    const result = processMultimodalInput(input);

    expect(result.accepted).toBe(false);
    expect(result.validationResult.status).toBe('corrupted');
    expect(result.validationResult.errorMessage).toContain('corrupted');
    expect(result.normalized).toBeUndefined();
  });

  it('Scenario 4 (Oversized): rejects an image that exceeds the 10 MB limit and never normalizes', () => {
    const oversizedData = jpegBytes(MAX_IMAGE_BYTES + 1 - 3);
    const input: MediaInput = {
      filename: 'raw-photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: oversizedData.length,
      data: oversizedData,
    };

    const result = processMultimodalInput(input);

    expect(result.accepted).toBe(false);
    expect(result.validationResult.status).toBe('oversized');
    expect(result.validationResult.errorMessage).toContain('exceeds limit');
    expect(result.normalized).toBeUndefined();
  });

  it('Image resize kicks in when heuristic dimension exceeds 1024 px cap', () => {
    // Simulate a 2048×2048 image (≈ 4 MB JPEG rough estimate)
    const bigImageData = jpegBytes(2048 * 2048 - 3);
    const input: MediaInput = {
      filename: 'huge-diagram.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: bigImageData.length,
      data: bigImageData,
    };

    const result = processMultimodalInput(input, { maxImageDimensionPx: 1024 });

    expect(result.accepted).toBe(true);
    expect(result.normalized!.wasResized).toBe(true);
    expect(result.normalized!.normalizedSizeBytes).toBeLessThan(input.sizeBytes);
  });

  it('Audio clip longer than maxAudioDurationSec is truncated before token estimation', () => {
    // Simulate 120-second clip (≈ 1.92 MB at 128kbps)
    const longAudio = wavBytes(120 * 16_000 - 4);
    const input: MediaInput = {
      filename: 'long-podcast.wav',
      mimeType: 'audio/wav',
      sizeBytes: longAudio.length,
      data: longAudio,
    };

    const result = processMultimodalInput(input, { maxAudioDurationSec: 60 });

    expect(result.accepted).toBe(true);
    expect(result.normalized!.wasResized).toBe(true);
    // After truncation to 60s: 60 × 25 = 1500 tokens
    expect(result.normalized!.estimatedTokens).toBeCloseTo(1500, 0);
  });

  it('Unsupported MIME type (video/mp4) is rejected immediately with unsupported_mime', () => {
    const input: MediaInput = {
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 500_000,
      data: new Uint8Array(10),
    };

    const result = processMultimodalInput(input);

    expect(result.accepted).toBe(false);
    expect(result.validationResult.status).toBe('unsupported_mime');
  });

  it('Cost estimation: image tokens → USD conversion is correct', () => {
    // 512×512 → 1 tile → 85 + 1*170 = 255 tokens
    const tokens = estimateImageTokens(512, 512);
    expect(tokens).toBe(85 + 1 * 170);
    // $0.0001 per 1k tokens → 255 tokens = $0.0000255
    expect(tokensToUsd(tokens)).toBeCloseTo(0.0000255, 7);
  });
});
