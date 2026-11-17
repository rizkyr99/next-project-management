// Prints a Markdown coverage table for the server actions and lib/authz.ts
// (the code that enforces who can do what), for the CI job summary.
// Exits non-zero when their combined line coverage drops below TARGET.
//
//   npm run test:coverage -- --coverage.reporter=json-summary
//   node scripts/coverage-summary.mjs
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const TARGET = 80;
const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));

const rows = Object.entries(summary)
  .filter(([file]) => /\/features\/[^/]+\/actions\.ts$|\/lib\/authz\.ts$/.test(file))
  .map(([file, s]) => ({ file: relative(process.cwd(), file), ...s.lines }))
  .sort((a, b) => a.pct - b.pct);

const covered = rows.reduce((n, r) => n + r.covered, 0);
const total = rows.reduce((n, r) => n + r.total, 0);
const pct = total ? (100 * covered) / total : 100;
const all = summary.total.lines.pct;

const out = [
  `### Coverage: server actions + authz ${pct.toFixed(1)}% (target ${TARGET}%)`,
  '',
  `All files: ${all}% of lines.`,
  '',
  '| File | Lines | Covered |',
  '| --- | ---: | ---: |',
  ...rows.map((r) => `| \`${r.file}\` | ${r.pct}% | ${r.covered}/${r.total} |`),
  `| **Combined** | **${pct.toFixed(1)}%** | **${covered}/${total}** |`,
];
console.log(out.join('\n'));

if (pct < TARGET) {
  console.error(`::error::Server actions + authz line coverage is ${pct.toFixed(1)}%, below the ${TARGET}% target.`);
  process.exitCode = 1;
}
