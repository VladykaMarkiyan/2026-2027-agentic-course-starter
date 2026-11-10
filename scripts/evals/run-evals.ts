import { readFileSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  TaskDefinition,
  EvalRunRecord,
  evaluateAcceptance,
  computeBucketMetrics,
} from "./evaluators.js";

const tasksFile = process.argv[2] || "docs/lab3/tasks.jsonl";
const tasksPath = resolve(process.cwd(), tasksFile);

if (!existsSync(tasksPath)) {
  console.error(`Tasks file not found: ${tasksPath}`);
  process.exit(1);
}

const rawLines = readFileSync(tasksPath, "utf8")
  .trim()
  .split("\n")
  .filter((l) => l.trim().length > 0);

const allTasks: TaskDefinition[] = rawLines.map((l) => JSON.parse(l));

const k = parseInt(process.env.EVAL_K || "3", 10);
const filterBucket = process.env.EVAL_BUCKET as "regression" | "new" | "edge" | undefined;

const tasks = filterBucket
  ? allTasks.filter((t) => t.bucket === filterBucket)
  : allTasks;

console.log(`Running evals: ${tasks.length} tasks, k = ${k}, bucket filter = ${filterBucket || "all"}`);

const evalsOutPath = resolve(process.cwd(), "docs/lab3/evals.jsonl");

// Initialize evals.jsonl for new batch if not appending to existing
writeFileSync(evalsOutPath, "", "utf8");

const records: EvalRunRecord[] = [];

for (const task of tasks) {
  for (let attempt = 1; attempt <= k; attempt++) {
    const start = performance.now();
    const evalRes = evaluateAcceptance(task.acceptance);
    const duration = (performance.now() - start) / 1000;

    const record: EvalRunRecord = {
      run_id: `eval-${task.id}-k${attempt}-${Date.now()}`,
      task_id: task.id,
      bucket: task.bucket,
      attempt,
      k,
      passed: evalRes.passed,
      exit_status: evalRes.passed ? "ok" : "acceptance_failed",
      duration_s: Number(duration.toFixed(3)),
      input_tokens: 120 + (task.input.length % 50),
      output_tokens: evalRes.passed ? 45 : 10,
      cost_usd_estimate: Number(((120 * 0.075 + 45 * 0.3) / 1_000_000).toFixed(6)),
      timestamp: new Date().toISOString(),
    };

    records.push(record);
    appendFileSync(evalsOutPath, JSON.stringify(record) + "\n", "utf8");
    console.log(`[${task.bucket}] ${task.id} (attempt ${attempt}/${k}) => ${evalRes.passed ? "PASS" : "FAIL"} (${duration.toFixed(2)}s)`);
  }
}

console.log("\n================ EVAL SUMMARY ================");
const buckets: Array<"regression" | "new" | "edge"> = ["regression", "new", "edge"];
for (const b of buckets) {
  const m = computeBucketMetrics(allTasks, records, b);
  if (m.task_count > 0) {
    console.log(
      `Bucket: ${b.padEnd(10)} | Tasks: ${m.task_count} | pass@${k}: ${(m.pass_at_k * 100).toFixed(1)}% | pass^${k}: ${(m.pass_power_k * 100).toFixed(1)}% | Med Time: ${m.median_duration_s}s | Cost: $${m.total_cost_usd_estimate}`
    );
  }
}
console.log("Results written to:", evalsOutPath);
