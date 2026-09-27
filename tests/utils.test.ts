import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/utils';

describe('formatDuration', () => {
  it('форматує мілісекунди', () => {
    expect(formatDuration(450)).toBe('450ms');
  });

  it('форматує секунди з десятковими частками', () => {
    expect(formatDuration(2500)).toBe('2.5s');
    expect(formatDuration(5000)).toBe('5s');
  });

  it('форматує хвилини та секунди', () => {
    expect(formatDuration(65000)).toBe('1m 5s');
    expect(formatDuration(120000)).toBe('2m 0s');
  });
});
