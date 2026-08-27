import { statSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState } from '@codemirror/state';
import { computeDimmedRanges } from '../../src/domain/focusMode';
import { computeLivePreviewInstructions } from '../../src/domain/livePreview';
import { parser } from '../../src/domain/markdownParser';
import { treeField } from '../../src/webview/treeField';
import { buildChapterFixture } from '../fixtures/chapterFixture';

/**
 * The **Operation count** measurements themselves (requirement 007),
 * shared between `performanceCheck.test.ts` (compares them against
 * `baseline.json`, under vitest) and `report.ts` (prints them next to the
 * baseline, under plain `node`) — BR-002/FR-009: one measurement, two
 * consumers, so neither can silently diverge from the other.
 *
 * Deliberately free of any test-framework import (no `vitest`) so
 * `report.ts` runs as plain compiled JS via `node`, the same way
 * `test/integration/runTest.ts` does.
 */

// process.cwd() rather than __dirname: tsc's outDir mirrors the source
// tree under out/ (out/test/performance/measure.js), which would resolve
// __dirname-relative paths to out/dist instead of the real dist/. Both
// npm run test:performance (vitest, run from the repo root) and
// npm run report:performance (compiled, also invoked from the repo root)
// share that same working directory.
const distDir = join(process.cwd(), 'dist');

/**
 * Wraps `parser.parse` and counts only the calls matching `kind` — `'full'`
 * for a whole-document reparse (no fragments passed, or an empty fragment
 * list), `'incremental'` for one that reused a previous tree's fragments
 * (US-004/US-006 of 008: `src/webview/treeField.ts`'s incremental update).
 * The two are the same underlying call; what distinguishes a full parse
 * from a **Tree update** is only whether fragments travelled with it.
 */
function countParseCalls(run: () => void, kind: 'full' | 'incremental'): number {
  const original: typeof parser.parse = parser.parse.bind(parser);
  let calls = 0;
  parser.parse = (...args: Parameters<typeof original>) => {
    const hasFragments = Array.isArray(args[1]) && args[1].length > 0;
    if (hasFragments === (kind === 'incremental')) {
      calls++;
    }
    return original(...args);
  };
  try {
    run();
    return calls;
  } finally {
    parser.parse = original;
  }
}

export function measureOperationCounts(): Record<string, number> {
  const fixture = buildChapterFixture(24);
  const cursor = { from: Math.floor(fixture.length / 2), to: Math.floor(fixture.length / 2) };

  // US-003 (008): the analysers no longer parse for themselves — each call
  // site (mirroring the real ones in src/webview/) parses its own tree, so
  // wrapping `parser.parse` still counts one call per traversal exactly as
  // it did before the signature changed.
  const tree = parser.parse(fixture);

  // US-004 (008): the Writing surface's own incremental state
  // (`src/webview/treeField.ts`), seeded once here — a full parse, same as
  // opening a Chapter (EDGE-001), deliberately outside the counted region
  // below since it is not on the typing path.
  const initialState = EditorState.create({ doc: fixture, extensions: [treeField] });

  return {
    // One document change (a keystroke), through the real incremental path:
    // `docChanged` reparses via TreeFragment.applyChanges + fragments, which
    // is a Tree update, not a full parse (US-004: this is now zero). The
    // extension host's word-count refresh no longer parses on this path
    // either (US-002 of 008): it is debounced off the hot path
    // (`writingEditorProvider.ts`'s `scheduleWordCountRecompute`).
    parsesPerKeystroke: countParseCalls(() => {
      initialState.update({ changes: { from: cursor.from, insert: 'x' } }).state.field(treeField);
    }, 'full'),
    // One selection-only change (a cursor move): `docChanged` is false, so
    // treeField.update leaves the tree untouched — no parse of any kind.
    parsesPerCursorMove: countParseCalls(() => {
      initialState.update({ selection: { anchor: Math.max(0, cursor.from - 1) } }).state.field(treeField);
    }, 'full'),
    // US-006 (008): the incremental work that replaced the full parse above
    // — BR-005's alarm needs both counted, or a future change could put a
    // full parse back on the typing path while a stray Tree update masked
    // it as "still incremental". A keystroke costs exactly one; a cursor
    // move costs none, same as the full-parse counts above.
    treeUpdatesPerKeystroke: countParseCalls(() => {
      initialState.update({ changes: { from: cursor.from, insert: 'x' } }).state.field(treeField);
    }, 'incremental'),
    treeUpdatesPerCursorMove: countParseCalls(() => {
      initialState.update({ selection: { anchor: Math.max(0, cursor.from - 1) } }).state.field(treeField);
    }, 'incremental'),
    livePreviewInstructions: computeLivePreviewInstructions(tree, fixture, cursor).length,
    dimRanges: computeDimmedRanges(tree, fixture, cursor).length,
    extensionBundleBytes: statSync(join(distDir, 'extension.js')).size,
    webviewBundleBytes: statSync(join(distDir, 'webview.js')).size,
    // Requirement 010 / ADR 0004: the Diagram renderer, counted separately
    // because it is loaded separately. Keeping it out of
    // `webviewBundleBytes` is the whole point of the split — a regression
    // here would be a Chapter without a Diagram paying for one, and the
    // only way to see that is for the two numbers to move independently.
    mermaidBundleBytes: statSync(join(distDir, 'mermaid.js')).size,
  };
}
