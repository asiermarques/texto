import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import spanishBundle from '../../l10n/bundle.l10n.es.json';

/**
 * US-005/US-006 (003): `vscode.l10n.t(...)` calls cannot be unit-tested
 * directly — `src/infrastructure/` is `vscode`-facing, out of vitest's
 * reach by convention (CLAUDE.md) — so this is the runtime-bundle
 * equivalent of test/unit/packageNls.test.ts's key-parity check (RISK-002):
 * every English source string passed to `vscode.l10n.t` anywhere in
 * `src/infrastructure/` must have a Spanish translation in
 * l10n/bundle.l10n.es.json, or a string added in English silently falls
 * back to English under a Spanish VSCode instead of failing the build.
 *
 * Two call shapes are extracted: `l10n.t('message', ...)` and the
 * `l10n.t({ message, comment })` object form (used by the word count's
 * selection suffix to disambiguate a singular/plural pair that share the
 * same English text — see wordCountStatusBar.ts). VSCode appends the
 * comment to the lookup key as `message + '/' + comment.join('')`.
 */
function sourceKeysCalledWithL10nT(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const keys: string[] = [];

  for (const match of source.matchAll(/vscode\.l10n\.t\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*[,)]/g)) {
    keys.push(match[2].replace(/\\(['"])/g, '$1'));
  }

  for (const match of source.matchAll(
    /vscode\.l10n\.t\(\s*\{\s*message:\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*comment:\s*\[\s*(['"])((?:\\.|(?!\3).)*)\3\s*\]/g
  )) {
    const message = match[2].replace(/\\(['"])/g, '$1');
    const comment = match[4].replace(/\\(['"])/g, '$1');
    keys.push(`${message}/${comment}`);
  }

  return keys;
}

const CHECKED_FILES = ['src/infrastructure/editorToolbar.ts', 'src/infrastructure/wordCountStatusBar.ts'];

describe('l10n/bundle.l10n.es.json — key parity with src/infrastructure/', () => {
  const englishSourceKeys = CHECKED_FILES.flatMap((relativePath) => sourceKeysCalledWithL10nT(path.resolve(__dirname, '../..', relativePath)));

  it('finds at least one vscode.l10n.t call to check (the extraction itself is not silently vacuous)', () => {
    expect(englishSourceKeys.length).toBeGreaterThan(0);
  });

  it('gives every English source key used at runtime a Spanish translation', () => {
    for (const key of englishSourceKeys) {
      expect(Object.prototype.hasOwnProperty.call(spanishBundle, key), `missing Spanish translation for "${key}"`).toBe(true);
    }
  });

  it('has no stale Spanish entry left over from a renamed or removed string', () => {
    for (const key of Object.keys(spanishBundle)) {
      expect(englishSourceKeys, `"${key}" in the Spanish bundle is not used by any vscode.l10n.t call`).toContain(key);
    }
  });
});
