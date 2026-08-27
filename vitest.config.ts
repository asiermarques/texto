import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    // One file in this suite, `test/unit/livePreviewLatency.test.ts`,
    // measures wall-clock time. Run in parallel workers it measures the
    // machine instead of the code — the very thing ADR 0002 rejects as a
    // per-commit signal: at 20 files its readings inflated ~2x over an
    // isolated run (2.5ms -> 10.2ms at 28k words) and crossed the budget on
    // CI, with the 11k Chapter reading *higher* than the 28k one, which is
    // OS scheduling, not work. Serialized, the readings are the same as in
    // isolation and stay a function of the code, so the alarm's budget keeps
    // its headroom as the suite grows. The suite is small enough that the
    // parallelism was worth ~2s.
    fileParallelism: false,
  },
});
