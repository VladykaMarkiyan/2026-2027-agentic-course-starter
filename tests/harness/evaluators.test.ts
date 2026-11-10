import { describe, it, expect } from "vitest";
import {
  evaluateFilesExist,
  evaluateBudgetCompliance,
  computeBucketMetrics,
  TaskDefinition,
  EvalRunRecord,
} from "../../scripts/evals/evaluators.js";

describe("Deterministic Evaluators", () => {
  it("evaluateFilesExist returns true when existing files are checked", () => {
    const res = evaluateFilesExist(["package.json", "tsconfig.json"]);
    expect(res.passed).toBe(true);
    expect(res.missing).toHaveLength(0);
  });

  it("evaluateFilesExist identifies missing files", () => {
    const res = evaluateFilesExist(["package.json", "non-existent-random-file.xyz"]);
    expect(res.passed).toBe(false);
    expect(res.missing).toEqual(["non-existent-random-file.xyz"]);
  });

  it("evaluateBudgetCompliance validates turn and cost upper bounds", () => {
    expect(evaluateBudgetCompliance(5, 0.05, 10, 0.2)).toBe(true);
    expect(evaluateBudgetCompliance(11, 0.05, 10, 0.2)).toBe(false);
    expect(evaluateBudgetCompliance(5, 0.25, 10, 0.2)).toBe(false);
  });
});

describe("Metric Computation (pass@k and pass^k)", () => {
  const dummyTasks: TaskDefinition[] = [
    {
      id: "t-01",
      input: "Task 1",
      acceptance: ["echo ok"],
      budget: { max_turns: 5, max_usd: 0.1, timeout_s: 60 },
      bucket: "regression",
      frozen_at: "2026-11-10T14:00:00Z",
    },
    {
      id: "t-02",
      input: "Task 2",
      acceptance: ["echo ok"],
      budget: { max_turns: 5, max_usd: 0.1, timeout_s: 60 },
      bucket: "regression",
      frozen_at: "2026-11-10T14:00:00Z",
    },
  ];

  it("computes 100% pass@k and pass^k when all attempts pass", () => {
    const records: EvalRunRecord[] = [
      {
        run_id: "r1",
        task_id: "t-01",
        bucket: "regression",
        attempt: 1,
        k: 2,
        passed: true,
        exit_status: "ok",
        duration_s: 1.2,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
      {
        run_id: "r2",
        task_id: "t-01",
        bucket: "regression",
        attempt: 2,
        k: 2,
        passed: true,
        exit_status: "ok",
        duration_s: 1.4,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
      {
        run_id: "r3",
        task_id: "t-02",
        bucket: "regression",
        attempt: 1,
        k: 2,
        passed: true,
        exit_status: "ok",
        duration_s: 0.9,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
      {
        run_id: "r4",
        task_id: "t-02",
        bucket: "regression",
        attempt: 2,
        k: 2,
        passed: true,
        exit_status: "ok",
        duration_s: 1.1,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
    ];

    const metrics = computeBucketMetrics(dummyTasks, records, "regression");
    expect(metrics.task_count).toBe(2);
    expect(metrics.k).toBe(2);
    expect(metrics.pass_at_k).toBe(1.0);
    expect(metrics.pass_power_k).toBe(1.0);
    expect(metrics.median_duration_s).toBe(1.15);
  });

  it("correctly distinguishes pass@k from pass^k on flaky results", () => {
    // t-01 passes attempt 1 but fails attempt 2 -> pass@2 is true, pass^2 is false
    // t-02 passes both -> pass@2 is true, pass^2 is true
    // Overall pass@2 should be 1.0 (2/2), pass^2 should be 0.5 (1/2)
    const records: EvalRunRecord[] = [
      {
        run_id: "r1",
        task_id: "t-01",
        bucket: "regression",
        attempt: 1,
        k: 2,
        passed: true,
        exit_status: "ok",
        duration_s: 1.0,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
      {
        run_id: "r2",
        task_id: "t-01",
        bucket: "regression",
        attempt: 2,
        k: 2,
        passed: false,
        exit_status: "failed",
        duration_s: 1.0,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
      {
        run_id: "r3",
        task_id: "t-02",
        bucket: "regression",
        attempt: 1,
        k: 2,
        passed: true,
        exit_status: "ok",
        duration_s: 1.0,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
      {
        run_id: "r4",
        task_id: "t-02",
        bucket: "regression",
        attempt: 2,
        k: 2,
        passed: true,
        exit_status: "ok",
        duration_s: 1.0,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd_estimate: 0.0001,
        timestamp: new Date().toISOString(),
      },
    ];

    const metrics = computeBucketMetrics(dummyTasks, records, "regression");
    expect(metrics.pass_at_k).toBe(1.0);
    expect(metrics.pass_power_k).toBe(0.5);
  });
});
