import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

export interface TaskDefinition {
  id: string;
  input: string;
  acceptance: string[];
  budget: {
    max_turns: number;
    max_usd: number;
    timeout_s: number;
  };
  files?: string[];
  label?: string;
  source?: string;
  bucket: "regression" | "new" | "edge";
  frozen_at: string;
}

export interface EvalRunRecord {
  run_id: string;
  task_id: string;
  bucket: "regression" | "new" | "edge";
  attempt: number;
  k: number;
  passed: boolean;
  exit_status: string;
  duration_s: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd_estimate: number;
  timestamp: string;
}

export interface BucketMetrics {
  bucket: "regression" | "new" | "edge";
  task_count: number;
  k: number;
  pass_at_k: number; // pass@k: at least 1 of k attempts succeeded
  pass_power_k: number; // pass^k: all k attempts succeeded
  median_duration_s: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  total_cost_usd_estimate: number;
}

/**
 * Deterministic Acceptance Evaluator:
 * Executes each command in the acceptance list. If all return exit code 0, returns true.
 */
export function evaluateAcceptance(
  acceptanceCmds: string[],
  cwd: string = process.cwd()
): { passed: boolean; results: { cmd: string; exit: number; error?: string }[] } {
  const results: { cmd: string; exit: number; error?: string }[] = [];
  let allPassed = true;

  for (const cmd of acceptanceCmds) {
    try {
      execSync(cmd, {
        cwd,
        stdio: "pipe",
        timeout: 60_000,
        env: { ...process.env, CI: "true" },
      });
      results.push({ cmd, exit: 0 });
    } catch (err: any) {
      allPassed = false;
      const exitCode = typeof err.status === "number" ? err.status : 1;
      results.push({
        cmd,
        exit: exitCode,
        error: err.stderr?.toString() || err.message,
      });
    }
  }

  return { passed: allPassed, results };
}

/**
 * Deterministic File Existence Evaluator:
 * Validates that all required files exist in the target directory.
 */
export function evaluateFilesExist(
  files: string[],
  cwd: string = process.cwd()
): { passed: boolean; missing: string[] } {
  const missing = files.filter((f) => !existsSync(join(cwd, f)));
  return { passed: missing.length === 0, missing };
}

/**
 * Deterministic Budget Compliance Evaluator:
 * Checks whether turn count and cost remain within specified upper bounds.
 */
export function evaluateBudgetCompliance(
  turns: number,
  costUsd: number,
  maxTurns: number,
  maxUsd: number
): boolean {
  if (turns > maxTurns) return false;
  if (costUsd > maxUsd) return false;
  return true;
}

/**
 * Computes pass@k and pass^k per task bucket.
 * pass@k = fraction of tasks where >= 1 attempt succeeded.
 * pass^k = fraction of tasks where all k attempts succeeded.
 */
export function computeBucketMetrics(
  tasks: TaskDefinition[],
  records: EvalRunRecord[],
  bucket: "regression" | "new" | "edge"
): BucketMetrics {
  const bucketTasks = tasks.filter((t) => t.bucket === bucket);
  if (bucketTasks.length === 0) {
    return {
      bucket,
      task_count: 0,
      k: 0,
      pass_at_k: 0,
      pass_power_k: 0,
      median_duration_s: 0,
      avg_input_tokens: 0,
      avg_output_tokens: 0,
      total_cost_usd_estimate: 0,
    };
  }

  const taskMap = new Map<string, EvalRunRecord[]>();
  for (const t of bucketTasks) {
    taskMap.set(t.id, []);
  }

  for (const r of records) {
    if (r.bucket === bucket && taskMap.has(r.task_id)) {
      taskMap.get(r.task_id)!.push(r);
    }
  }

  let tasksWithAtLeastOnePass = 0;
  let tasksWithAllPass = 0;
  const durations: number[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  let totalAttempts = 0;
  let determinedK = 1;

  for (const [, attempts] of taskMap.entries()) {
    if (attempts.length === 0) continue;
    determinedK = Math.max(determinedK, attempts.length);
    const passedCount = attempts.filter((a) => a.passed).length;
    if (passedCount >= 1) tasksWithAtLeastOnePass++;
    if (passedCount === attempts.length) tasksWithAllPass++;

    for (const a of attempts) {
      durations.push(a.duration_s);
      totalInputTokens += a.input_tokens;
      totalOutputTokens += a.output_tokens;
      totalCost += a.cost_usd_estimate;
      totalAttempts++;
    }
  }

  durations.sort((a, b) => a - b);
  let medianDuration = 0;
  if (durations.length > 0) {
    const mid = Math.floor(durations.length / 2);
    if (durations.length % 2 === 1) {
      medianDuration = durations[mid] ?? 0;
    } else {
      const left = durations[mid - 1] ?? 0;
      const right = durations[mid] ?? 0;
      medianDuration = (left + right) / 2;
    }
  }

  return {
    bucket,
    task_count: bucketTasks.length,
    k: determinedK,
    pass_at_k: Number((tasksWithAtLeastOnePass / bucketTasks.length).toFixed(3)),
    pass_power_k: Number((tasksWithAllPass / bucketTasks.length).toFixed(3)),
    median_duration_s: Number(medianDuration.toFixed(2)),
    avg_input_tokens: totalAttempts > 0 ? Math.round(totalInputTokens / totalAttempts) : 0,
    avg_output_tokens: totalAttempts > 0 ? Math.round(totalOutputTokens / totalAttempts) : 0,
    total_cost_usd_estimate: Number(totalCost.toFixed(4)),
  };
}
