import { describe, expect, it } from 'vitest';

import { agreement, type Label } from '../../src/verify/kappa';
import { isBlocked, verifyReport } from '../../src/verify/schema';

describe('verifier schema & blocking', () => {
  it('блокує якщо хоча б один вердикт fail або unknown', () => {
    const reportPass = {
      results: [
        { id: 'c-01', verdict: 'pass' as const, reason: 'все ок', evidence: 'line 10' },
        { id: 'c-02', verdict: 'pass' as const, reason: 'все ок', evidence: 'line 20' },
      ],
    };
    expect(isBlocked(reportPass)).toBe(false);

    const reportFail = {
      results: [
        { id: 'c-01', verdict: 'pass' as const, reason: 'все ок', evidence: 'line 10' },
        { id: 'c-02', verdict: 'fail' as const, reason: 'помилка', evidence: 'line 25' },
      ],
    };
    expect(isBlocked(reportFail)).toBe(true);

    const reportUnknown = {
      results: [
        { id: 'c-01', verdict: 'pass' as const, reason: 'все ок', evidence: 'line 10' },
        { id: 'c-02', verdict: 'unknown' as const, reason: 'недостатньо даних', evidence: '' },
      ],
    };
    // У Лаб. 3 unknown також блокує!
    expect(isBlocked(reportUnknown)).toBe(true);
  });

  it('валідує коректну схему вердикту', () => {
    const valid = {
      results: [
        { id: 'c-01', verdict: 'pass', reason: 'тест пройдено', evidence: 'tests/cost.test.ts:1' },
      ],
    };
    expect(() => verifyReport.parse(valid)).not.toThrow();
  });
});

describe('kappa agreement', () => {
  it('рахує ідеальну згоду (kappa = 1)', () => {
    const mine: Label[] = ['pass', 'fail', 'unknown', 'pass', 'pass'];
    const judge: Label[] = ['pass', 'fail', 'unknown', 'pass', 'pass'];
    const res = agreement(mine, judge);
    expect(res.raw).toBe(1);
    expect(res.kappa).toBe(1);
  });

  it('рахує згоду на неідеальних розмітках', () => {
    const mine: Label[] = ['pass', 'pass', 'fail', 'pass', 'unknown', 'fail', 'pass', 'pass', 'fail', 'pass'];
    const judge: Label[] = ['pass', 'pass', 'fail', 'pass', 'fail', 'fail', 'pass', 'pass', 'unknown', 'pass'];
    const res = agreement(mine, judge);
    expect(res.raw).toBe(0.8);
    expect(res.kappa).toBeGreaterThan(0.5);
  });
});
