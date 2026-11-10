import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { TaskDefinition, EvalRunRecord } from "./evaluators.js";

const tasksPath = resolve(process.cwd(), "docs/lab3/tasks.jsonl");
const evalsPath = resolve(process.cwd(), "docs/lab3/evals.jsonl");
const baselinePath = resolve(process.cwd(), "docs/lab3/evals-baseline.json");

const isWriteBaseline = process.argv.includes("--write-baseline");

if (!existsSync(evalsPath)) {
  console.error(`Evals results file not found at ${evalsPath}. Run run-evals.ts first.`);
  process.exit(1);
}

const rawEvals = readFileSync(evalsPath, "utf8")
  .trim()
  .split("\n")
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as EvalRunRecord);

const rawTasks = existsSync(tasksPath)
  ? readFileSync(tasksPath, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as TaskDefinition)
  : [];

// Group attempts by task_id
const taskAttempts = new Map<string, EvalRunRecord[]>();
for (const record of rawEvals) {
  if (!taskAttempts.has(record.task_id)) {
    taskAttempts.set(record.task_id, []);
  }
  taskAttempts.get(record.task_id)!.push(record);
}

const taskSummary: Record<string, { bucket: string; pass_at_k: number; pass_power_k: number }> = {};
for (const [taskId, attempts] of taskAttempts.entries()) {
  const bucket = attempts[0]?.bucket || "unknown";
  const passCount = attempts.filter((a) => a.passed).length;
  taskSummary[taskId] = {
    bucket,
    pass_at_k: passCount >= 1 ? 1 : 0,
    pass_power_k: passCount === attempts.length ? 1 : 0,
  };
}

if (isWriteBaseline) {
  const baselineData = {
    created_at: new Date().toISOString(),
    k: rawEvals[0]?.k || 1,
    task_count: Object.keys(taskSummary).length,
    tasks: taskSummary,
  };
  writeFileSync(baselinePath, JSON.stringify(baselineData, null, 2) + "\n", "utf8");
  console.log(`[EVAL GATE] Baseline successfully written to ${baselinePath}`);
  process.exit(0);
}

// Validation Mode
if (!existsSync(baselinePath)) {
  console.error(`[EVAL GATE] Baseline file not found at ${baselinePath}. Run with --write-baseline first.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
  tasks: Record<string, { bucket: string; pass_at_k: number; pass_power_k: number }>;
};

let regressionsCount = 0;
const regressions: string[] = [];

for (const [taskId, base] of Object.entries(baseline.tasks)) {
  // Only enforce regression check on regression bucket
  if (base.bucket !== "regression") continue;

  const current = taskSummary[taskId];
  if (!current) {
    regressions.push(`Task ${taskId} is missing from current evaluation run!`);
    regressionsCount++;
    continue;
  }

  if (base.pass_power_k === 1 && current.pass_power_k < 1) {
    regressions.push(
      `Regression on ${taskId}: baseline pass^k was ${base.pass_power_k}, but current is ${current.pass_power_k}`
    );
    regressionsCount++;
  }
}

if (regressionsCount > 0) {
  console.error("\n================ EVAL REGRESSION GATE FAILED ================");
  console.error(`Detected ${regressionsCount} regression(s) in regression bucket:`);
  for (const r of regressions) {
    console.error(` - ${r}`);
  }
  console.error("=============================================================\n");
  process.exit(1);
}

console.log("\n[EVAL GATE] All regression bucket tasks passed without regressions! (Code 0)");
process.exit(0);
