// Requirement 007 (US-003): enables the versioned pre-commit hook
// (.githooks/pre-commit) on `npm install`, so a fresh clone is guarded
// without the Author remembering a manual step. Runs on the CI runner's
// `npm ci` too (EDGE-003) — deliberately never fails the install: a checkout
// with no git metadata (e.g. this package installed as a dependency rather
// than cloned) has nothing to enable, not an error.
const { execSync } = require('node:child_process');

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
  // Not a git checkout — nothing to enable.
}
