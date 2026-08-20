import { defineConfig } from 'vitest/config';

// Kept separate from vitest.config.ts (test:unit) rather than widening its
// `include`: test:unit must not start depending on a build having run
// (requirement 007's constraint), and US-002's bundle-byte metrics need
// `dist/` to exist. See package.json's `pretest:performance`.
export default defineConfig({
  test: {
    include: ['test/performance/**/*.test.ts'],
  },
});
