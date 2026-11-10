/**
 * Circuit Breaker для черги задач (крок 03).
 * Запобігає нескінченному спалюванню квот, токенів та часу при повторюваних аваріях.
 * Патерн: Martin Fowler (2014) — стани closed / open / half-open.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface BreakerState {
  readonly state: 'closed' | 'open' | 'half-open';
  readonly fails: number;
  readonly openedAt: string | null;
  readonly trip: string | null;
}

export const DEFAULT_BREAKER_FILE = '.harness/breaker.json';
export const DEFAULT_FAIL_THRESHOLD = 3;       // 3 аварії підряд = перехід у стан open
export const DEFAULT_COOLDOWN_MINUTES = 15;    // 15 хвилин перепочинку перед спробою

export function loadBreaker(file = DEFAULT_BREAKER_FILE): BreakerState {
  try {
    if (!existsSync(file)) {
      return { state: 'closed', fails: 0, openedAt: null, trip: null };
    }
    return JSON.parse(readFileSync(file, 'utf8')) as BreakerState;
  } catch {
    return { state: 'closed', fails: 0, openedAt: null, trip: null };
  }
}

export function saveBreaker(state: BreakerState, file = DEFAULT_BREAKER_FILE): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Перевірка перед стартом кожної задачі: чи дозволено запуск.
 */
export function mayRunTask(
  file = DEFAULT_BREAKER_FILE,
  cooldownMin = DEFAULT_COOLDOWN_MINUTES,
): { allow: boolean; probe: boolean; why: string } {
  const b = loadBreaker(file);

  if (b.state === 'closed') {
    return { allow: true, probe: false, why: 'closed: система стабільна' };
  }

  const openedTime = b.openedAt ? Date.parse(b.openedAt) : 0;
  const waitedMin = (Date.now() - openedTime) / 60000;

  if (waitedMin < cooldownMin) {
    return {
      allow: false,
      probe: false,
      why: `open: аварійне зупинення через "${b.trip ?? 'fault'}", очікується охолодження (минуло ${Math.round(waitedMin)}/${cooldownMin} хв)`,
    };
  }

  // Час охолодження минув — переходимо в half-open для однієї пробної задачі
  saveBreaker({ ...b, state: 'half-open' }, file);
  return { allow: true, probe: true, why: 'half-open: запуск однієї пробної задачі' };
}

/**
 * Фіксація результату виконання задачі.
 */
export function recordTaskResult(
  ok: boolean,
  tripReason: string | null,
  file = DEFAULT_BREAKER_FILE,
  threshold = DEFAULT_FAIL_THRESHOLD,
): BreakerState {
  const b = loadBreaker(file);

  if (ok) {
    // Успіх скидає лічильник і переводить у closed
    const newState: BreakerState = { state: 'closed', fails: 0, openedAt: null, trip: null };
    saveBreaker(newState, file);
    return newState;
  }

  const fails = b.fails + 1;
  const shouldOpen = b.state === 'half-open' || fails >= threshold;

  const newState: BreakerState = {
    state: shouldOpen ? 'open' : 'closed',
    fails,
    openedAt: shouldOpen ? new Date().toISOString() : null,
    trip: shouldOpen ? tripReason : null,
  };

  saveBreaker(newState, file);
  return newState;
}

/**
 * Скидання стану брейкера.
 */
export function resetBreaker(file = DEFAULT_BREAKER_FILE): void {
  saveBreaker({ state: 'closed', fails: 0, openedAt: null, trip: null }, file);
}
