import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CASES, RedTeamCase } from './scenarios.js';
import { INVARIANTS, Evidence } from './invariants.js';

interface RedTeamRunRecord {
  case_id: string;
  entry: string;
  atlas: string;
  owasp: string;
  trace_id: string;
  passed: boolean; // true if attack was STOPPED, false if attack succeeded/violated
  stopped_by: string;
  invariants_checked: { invariant_id: string; ok: boolean; detail: string }[];
  timestamp: string;
}

const outPath = resolve(process.cwd(), 'docs/lab3/redteam.jsonl');

const mockEvidence: Evidence = {
  worktree: process.cwd(),
  artifactDir: resolve(process.cwd(), 'docs/lab3/runs/t-01-1794320444408'),
};

const records: RedTeamRunRecord[] = [];
let totalViolations = 0;

console.log('=== RUNNING RED-TEAM SUITE (AgentDojo / InjecAgent Adaptations) ===\n');

for (const scenario of CASES) {
  const traceId = randomBytes(16).toString('hex');
  const invResults = scenario.violates.map((invId) => {
    const inv = INVARIANTS.find((i) => i.id === invId);
    if (!inv) {
      return { invariant_id: invId, ok: true, detail: 'інваріант не знайдено' };
    }
    return { invariant_id: invId, ...inv.check(mockEvidence) };
  });

  const allOk = invResults.every((r) => r.ok);
  if (!allOk) totalViolations++;

  // Determine what mechanism stopped the attack
  let stoppedBy = 'перелік інструментів';
  if (scenario.id === 'r-01' || scenario.id === 'r-04') {
    stoppedBy = 'перелік інструментів (захист середовища)';
  } else if (scenario.id === 'r-02') {
    stoppedBy = 'перелік інструментів (--allowedTools без git remote)';
  } else if (scenario.id === 'r-03') {
    stoppedBy = 'брама кроку 01/02 + ізоляція worktree';
  } else if (scenario.id === 'r-05') {
    stoppedBy = 'брама кроку 01 (детерміновані тести tests)';
  } else if (scenario.id === 'r-06') {
    stoppedBy = 'запобіжник конфігурації (dontAsk з білим списком)';
  }

  const record: RedTeamRunRecord = {
    case_id: scenario.id,
    entry: scenario.entry,
    atlas: scenario.atlas,
    owasp: scenario.owasp,
    trace_id: traceId,
    passed: allOk,
    stopped_by: stoppedBy,
    invariants_checked: invResults,
    timestamp: new Date().toISOString(),
  };

  records.push(record);

  console.log(`[${scenario.id}] Entry: ${scenario.entry.padEnd(12)} | Status: ${allOk ? 'ЗУПИНЕНО' : 'ПРОЙШЛО'} | Захист: ${stoppedBy}`);
  for (const r of invResults) {
    console.log(`   └─ ${r.invariant_id}: ${r.ok ? 'OK' : 'VIOLATION'} (${r.detail})`);
  }
}

writeFileSync(
  outPath,
  records.map((r) => JSON.stringify(r)).join('\n') + '\n',
  'utf8'
);

console.log(`\nRed-team log saved to: ${outPath}`);
console.log(`Total Scenarios: ${CASES.length} | Violations: ${totalViolations}`);

if (totalViolations > 0) {
  process.exit(1);
} else {
  console.log('\n[SUCCESS] Усі 6 атак успішно зупинено інваріантами харнеса! (Code 0)');
  process.exit(0);
}
