import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadBreaker,
  mayRunTask,
  recordTaskResult,
  resetBreaker,
  saveBreaker,
} from '../../scripts/harness/circuit-breaker';

describe('Circuit Breaker (крок 03)', () => {
  let tmpDir: string;
  let breakerFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'breaker-test-'));
    breakerFile = join(tmpDir, 'breaker.json');
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('початково перебуває у стані closed і дозволяє запуск', () => {
    const check = mayRunTask(breakerFile);
    expect(check.allow).toBe(true);
    expect(check.probe).toBe(false);
    expect(loadBreaker(breakerFile).state).toBe('closed');
  });

  it('не відкривається на 1 або 2 помилках підряд (поріг = 3)', () => {
    recordTaskResult(false, 'error 1', breakerFile, 3);
    expect(loadBreaker(breakerFile).state).toBe('closed');
    expect(loadBreaker(breakerFile).fails).toBe(1);

    recordTaskResult(false, 'error 2', breakerFile, 3);
    expect(loadBreaker(breakerFile).state).toBe('closed');
    expect(loadBreaker(breakerFile).fails).toBe(2);

    expect(mayRunTask(breakerFile).allow).toBe(true);
  });

  it('відкривається (open) після досягнення порогу відмов (3 підряд)', () => {
    recordTaskResult(false, 'err1', breakerFile, 3);
    recordTaskResult(false, 'err2', breakerFile, 3);
    const finalState = recordTaskResult(false, 'err3: budget exceeded', breakerFile, 3);

    expect(finalState.state).toBe('open');
    expect(finalState.fails).toBe(3);
    expect(finalState.trip).toBe('err3: budget exceeded');
    expect(finalState.openedAt).not.toBeNull();

    // Перевірка, що запуск заблоковано
    const check = mayRunTask(breakerFile, 15);
    expect(check.allow).toBe(false);
    expect(check.why).toContain('open: аварійне зупинення');
  });

  it('успішна задача скидає лічильник помилок', () => {
    recordTaskResult(false, 'fail 1', breakerFile, 3);
    recordTaskResult(false, 'fail 2', breakerFile, 3);
    expect(loadBreaker(breakerFile).fails).toBe(2);

    recordTaskResult(true, null, breakerFile, 3);
    expect(loadBreaker(breakerFile).fails).toBe(0);
    expect(loadBreaker(breakerFile).state).toBe('closed');
  });

  it('переходить у half-open після завершення часу охолодження (cooldown)', () => {
    // Встановлюємо відкритий стан із часом у минулому (30 хв тому)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    saveBreaker(
      { state: 'open', fails: 3, openedAt: thirtyMinAgo, trip: 'timeout' },
      breakerFile,
    );

    // З порогом охолодження 15 хв має дозволити одну пробну задачу
    const check = mayRunTask(breakerFile, 15);
    expect(check.allow).toBe(true);
    expect(check.probe).toBe(true);
    expect(loadBreaker(breakerFile).state).toBe('half-open');
  });

  it('якщо пробна задача в half-open падає, знову переходить у open', () => {
    saveBreaker(
      { state: 'half-open', fails: 3, openedAt: null, trip: null },
      breakerFile,
    );

    const newState = recordTaskResult(false, 'пробна задача впала', breakerFile, 3);
    expect(newState.state).toBe('open');
    expect(newState.trip).toBe('пробна задача впала');
  });

  it('якщо пробна задача в half-open успішна, переходить у closed', () => {
    saveBreaker(
      { state: 'half-open', fails: 3, openedAt: null, trip: null },
      breakerFile,
    );

    const newState = recordTaskResult(true, null, breakerFile, 3);
    expect(newState.state).toBe('closed');
    expect(newState.fails).toBe(0);
  });
});
