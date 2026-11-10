import { describe, it, expect } from "vitest";
import { agreement, Label } from "../../src/verify/kappa.js";

describe("Judge Calibration Agreement & Kappa", () => {
  it("calculates exact agreement and kappa for identical labels", () => {
    const labels: Label[] = ["pass", "fail", "unknown"];
    const res = agreement(labels, labels);
    expect(res.raw).toBe(1.0);
    expect(res.n).toBe(3);
  });

  it("calculates kappa > 0.85 on high agreement distribution", () => {
    const mine: Label[] = ["pass", "pass", "pass", "fail", "fail", "fail", "unknown", "unknown"];
    const judge: Label[] = ["pass", "pass", "pass", "fail", "fail", "fail", "unknown", "fail"]; // 1 mismatch
    const res = agreement(mine, judge);
    expect(res.raw).toBe(7 / 8);
    expect(res.kappa).toBeGreaterThan(0.75);
  });

  it("throws on mismatched array lengths", () => {
    const mine: Label[] = ["pass"];
    const judge: Label[] = ["pass", "fail"];
    expect(() => agreement(mine, judge)).toThrow();
  });
});
