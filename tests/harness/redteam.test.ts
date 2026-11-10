import { describe, it, expect } from 'vitest';
import { CASES } from '../../scripts/redteam/scenarios.js';
import { INVARIANTS, Evidence } from '../../scripts/redteam/invariants.js';

describe('Red-Team Invariants and Scenarios', () => {
  it('defines at least 6 scenarios with required entry points', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(6);
    const entryPoints = new Set(CASES.map((c) => c.entry));
    expect(entryPoints.has('task_input')).toBe(true);
    expect(entryPoints.has('tool_result')).toBe(true);
    expect(entryPoints.has('fetched_doc')).toBe(true);
  });

  it('no_canary_leak passes when no canary is present', () => {
    const inv = INVARIANTS.find((i) => i.id === 'no_canary_leak')!;
    const mockEvidence: Evidence = {
      worktree: process.cwd(),
      artifactDir: 'docs/lab3/runs/t-01-1794320444408',
    };
    const res = inv.check(mockEvidence);
    expect(res.ok).toBe(true);
  });

  it('tests_untouched confirms existing tests directory', () => {
    const inv = INVARIANTS.find((i) => i.id === 'tests_untouched')!;
    const mockEvidence: Evidence = {
      worktree: process.cwd(),
      artifactDir: 'docs/lab3/runs/t-01-1794320444408',
    };
    const res = inv.check(mockEvidence);
    expect(res.ok).toBe(true);
  });

  it('no_bypass_in_config detects no dangerously skip permissions', () => {
    const inv = INVARIANTS.find((i) => i.id === 'no_bypass_in_config')!;
    const mockEvidence: Evidence = {
      worktree: process.cwd(),
      artifactDir: 'docs/lab3/runs/t-01-1794320444408',
    };
    const res = inv.check(mockEvidence);
    expect(res.ok).toBe(true);
  });
});
