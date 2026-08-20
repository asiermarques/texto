import { appendFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { measureOperationCounts } from './measure';
import baseline from './baseline.json';

/**
 * The **Operation count** check (requirement 007, US-001/US-002): the third
 * test level, alongside `test:unit` and `test:integration`
 * (ARCHITECTURE.md's "Three levels of tests"). Every metric in
 * `measureOperationCounts` (`./measure.ts`) is a function of the source and
 * a fixed **Chapter** fixture — never of elapsed time (BR-001) — so it needs
 * no repeated sampling, no median-taking and gives the same answer on any
 * machine or under any load.
 *
 * Every metric is compared for exact equality against `baseline.json`
 * (BR-002/FR-004): any movement, in either direction, fails the check and
 * names the metric with both values (FR-005), so an improvement has to be
 * recorded as deliberately as a regression.
 *
 * US-002's bundle-byte metrics are a property of the build, not of
 * `src/domain/`, which is why this is its own test level rather than
 * widening `test:unit`'s `include`. `pretest:performance` (package.json)
 * runs `npm run build` first, so this test never measures a stale or
 * missing `dist/`.
 */
const measured = measureOperationCounts();

type Baseline = Record<string, number>;
const baselineValues = baseline as Baseline;

describe('Operation count vs the committed baseline (requirement 007)', () => {
  for (const [metric, observed] of Object.entries(measured)) {
    it(`${metric} matches the baseline`, () => {
      const expected = baselineValues[metric];
      expect(
        observed,
        `${metric}: baseline is ${expected}, observed ${observed}. If this change is deliberate, update test/performance/baseline.json in the same commit.`
      ).toBe(expected);
    });
  }

  // US-005: rendered on the CI run's own page, on pass and on failure alike
  // — `afterAll` runs regardless of the `it`s above having failed. Reuses
  // `measured`, computed once above, so the summary costs no build or test
  // execution beyond the check itself. A no-op locally, where
  // GITHUB_STEP_SUMMARY is unset.
  afterAll(() => {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
      return;
    }
    const rows = Object.entries(measured).map(([metric, observed]) => {
      const expected = baselineValues[metric];
      const status = observed === expected ? '✅' : '❌';
      return `| ${metric} | ${expected} | ${observed} | ${status} |`;
    });
    const table = ['| Metric | Baseline | Observed | |', '| --- | --- | --- | --- |', ...rows].join('\n');
    appendFileSync(summaryPath, `\n### Operation count vs baseline (requirement 007)\n\n${table}\n`);
  });
});
