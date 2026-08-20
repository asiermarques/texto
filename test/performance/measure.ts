import { statSync } from 'node:fs';
import { join } from 'node:path';
import { computeDimmedRanges } from '../../src/domain/focusMode';
import { computeLivePreviewInstructions } from '../../src/domain/livePreview';
import { parser } from '../../src/domain/markdownParser';
import { countWords } from '../../src/domain/wordCount';
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

function countParses(run: () => void): number {
  const original: typeof parser.parse = parser.parse.bind(parser);
  let calls = 0;
  parser.parse = (...args: Parameters<typeof original>) => {
    calls++;
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

  return {
    // One document change (a keystroke): fires both webview ViewPlugins
    // (`docChanged`) and the extension host's word-count refresh
    // (`writingEditorProvider.ts`'s `onDidChangeTextDocument` handler).
    parsesPerKeystroke: countParses(() => {
      computeLivePreviewInstructions(fixture, cursor);
      computeDimmedRanges(fixture, cursor);
      countWords(fixture);
    }),
    // One selection-only change (a cursor move): fires only the two
    // webview ViewPlugins (`selectionSet`) — the word count's selection
    // figure needs a non-empty selection, which a bare cursor move never
    // has (src/webview/main.ts).
    parsesPerCursorMove: countParses(() => {
      computeLivePreviewInstructions(fixture, cursor);
      computeDimmedRanges(fixture, cursor);
    }),
    livePreviewInstructions: computeLivePreviewInstructions(fixture, cursor).length,
    dimRanges: computeDimmedRanges(fixture, cursor).length,
    extensionBundleBytes: statSync(join(distDir, 'extension.js')).size,
    webviewBundleBytes: statSync(join(distDir, 'webview.js')).size,
  };
}
