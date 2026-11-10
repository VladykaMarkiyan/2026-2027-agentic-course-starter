// Вердикти брам → поле gates у run.json найсвіжішого прогону.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : 'skipped';
};

// GitHub дає success | failure | cancelled | skipped — зводимо до pass | fail | skipped
const verdict = (r) => (r === 'success' ? 'pass' : r === 'skipped' || r === 'cancelled' ? 'skipped' : 'fail');

const gates = {
  types: verdict(arg('types')),
  lint: verdict(arg('lint')),
  tests: verdict(arg('tests')),
  build: verdict(arg('build')),
};

const root = 'docs/lab3/runs';
const dirs = readdirSync(root).map((d) => join(root, d)).filter((p) => statSync(p).isDirectory());
const latest = dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!latest) {
  console.error('немає жодного прогону в docs/lab3/runs — нема куди писати вердикти');
  process.exit(1);
}

const file = join(latest, 'run.json');
const record = { ...JSON.parse(readFileSync(file, 'utf8')), gates, ci_run_url: arg('run-url') };
writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
writeFileSync(
  'gate-record.json',
  `${JSON.stringify(
    {
      task_id: record.task_id,
      artifact_dir: record.artifact_dir,
      gates,
      ci_run_url: record.ci_run_url,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(`вердикти записано: ${file}`);
