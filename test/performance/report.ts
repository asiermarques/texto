import { measureOperationCounts } from './measure';
import baseline from './baseline.json';

/**
 * Read-only report of the current **Operation count** measurements next to
 * `baseline.json` (requirement 007, US-006). Prints and exits; never writes
 * anything, the baseline included — updating a recorded value stays a
 * deliberate edit in a commit (BR-002).
 *
 * Compiled by `tsc` (tsconfig.test.json) and run as plain JS via
 * `npm run report:performance`, the same shape `test:integration` already
 * uses for `runTest.ts`. Also the source of the summary US-005 renders on
 * the CI run page: `gate.yml` pipes this same output into
 * `$GITHUB_STEP_SUMMARY`, so the check and its two reports never compute the
 * numbers three different ways.
 */
type Baseline = Record<string, number>;

function formatDiff(observed: number, expected: number): string {
  const diff = observed - expected;
  if (diff === 0) {
    return 'no change';
  }
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function main(): void {
  const measured = measureOperationCounts();
  const baselineValues = baseline as Baseline;

  const rows = Object.entries(measured).map(([metric, observed]) => {
    const expected = baselineValues[metric];
    return { metric, expected, observed, diff: formatDiff(observed, expected) };
  });

  const metricWidth = Math.max(...rows.map((row) => row.metric.length), 'metric'.length);
  const header = `${'metric'.padEnd(metricWidth)}  baseline  observed  diff`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const row of rows) {
    console.log(`${row.metric.padEnd(metricWidth)}  ${String(row.expected).padStart(8)}  ${String(row.observed).padStart(8)}  ${row.diff}`);
  }
}

main();
