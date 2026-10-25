import { describe, expect, it } from 'vitest';
import { criterionVerdict, verificationReport } from '../src/verify/schema';

describe('criterionVerdict schema', () => {
  it('валідує коректний вердикт pass із доказами', () => {
    const raw = {
      id: 'A1',
      verdict: 'pass',
      reason: 'Усі 97 тестів Vitest проходять без помилок.',
      evidence: 'tests/validate-golden.test.ts#L10',
    };
    const parsed = criterionVerdict.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it('дозволяє аварійний вихід unknown', () => {
    const raw = {
      id: 'A4',
      verdict: 'unknown',
      reason: 'У наданому diff немає коду MCP сервера.',
      evidence: 'diff не містить змін у src/mcp',
    };
    const parsed = criterionVerdict.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it('відхиляє невалідний вердикт або порожній reason', () => {
    const invalid = {
      id: 'A2',
      verdict: 'maybe',
      reason: '',
      evidence: 'none',
    };
    const parsed = criterionVerdict.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('валідує масив вердиктів для звіту', () => {
    const report = [
      { id: 'A1', verdict: 'pass', reason: 'Тести пройшли', evidence: 'CI run #42' },
      { id: 'A2', verdict: 'fail', reason: 'Виявлено витік факту в запит', evidence: 'queries.jsonl#L14' },
    ];
    const parsed = verificationReport.safeParse(report);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.length).toBe(2);
    }
  });
});
