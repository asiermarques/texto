import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { computeDimmedRanges } from '../../src/domain/focusMode';
import { computeLivePreviewInstructions } from '../../src/domain/livePreview';
import { treeField } from '../../src/webview/treeField';
import { buildChapterFixture } from '../fixtures/chapterFixture';

/**
 * US-007 (008, retargeting US-017/RISK-001): a keystroke's real cost after
 * requirement 008 — one incremental Tree update
 * (`src/webview/treeField.ts`) plus the two traversals that read it
 * (`computeLivePreviewInstructions`, `computeDimmedRanges`) — measured the
 * way `src/webview/main.ts` actually pays it: a transaction dispatched
 * against a document the tree has already seen once, not a fresh full
 * parse every time.
 *
 * Measured at the Chapter lengths that hurt *before* this requirement (11k,
 * 28k words — the ADR's own table, `docs/adr/0001-…`), not the 3k/6k pair
 * that measured "comfortably inside budget" and let three full parses per
 * keystroke go unnoticed until a longer Chapter was actually tried. This is
 * the gap requirement 008 closes: retargeting the test at the lengths that
 * were the problem, not the ones that happened to look fine.
 *
 * The budget stays deliberately loose — an order-of-magnitude alarm, not a
 * second pass/fail scale (NOGOAL-001 of requirement 007; **Operation
 * count**, `test/performance/performanceCheck.test.ts`, is the scale). This
 * suite runs sharing the machine's CPU with the rest of `test:unit`, so the
 * budget has to survive that noise, not just a clean, isolated run. Same
 * shape as before: 20 samples, the median, not a single reading — one slow
 * tick from GC or OS scheduling shouldn't decide the result.
 *
 * Result (see the console output when this test runs): the incremental path
 * stays near-constant across the two sizes, unlike the full parse it
 * replaced — the whole point of requirement 008. RISK-001's mitigation
 * (sharing one parse between Live preview and Focus mode, and making it
 * incremental) IS taken here, per ADR 0001: the two traversals now read one
 * `Tree` maintained as state, reused across edits, rather than each parsing
 * the whole Chapter again.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** One keystroke, through the real incremental path: a transaction against a document the tree has already parsed once. */
function measureKeystroke(text: string): number {
  const cursorPos = Math.floor(text.length / 2);
  const baseState = EditorState.create({ doc: text, extensions: [treeField] });
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const nextState = baseState.update({ changes: { from: cursorPos, insert: 'x' } }).state;
    const tree = nextState.field(treeField);
    const nextText = nextState.doc.toString();
    const selection = { from: cursorPos + 1, to: cursorPos + 1 };
    computeLivePreviewInstructions(tree, nextText, selection);
    computeDimmedRanges(tree, nextText, selection);
    samples.push(performance.now() - start);
  }
  return median(samples);
}

const BUDGET_MS = 10;

describe('A keystroke through the incremental path — US-007 (008)', () => {
  it('stays under budget on a long Chapter (~11,000 words)', () => {
    const text = buildChapterFixture(40);
    const medianMs = measureKeystroke(text);
    // eslint-disable-next-line no-console
    console.log(`~11,000 words (${text.length} chars): median ${medianMs.toFixed(2)}ms over 20 keystrokes (budget ${BUDGET_MS}ms).`);
    expect(medianMs).toBeLessThan(BUDGET_MS);
  });

  it('stays under budget on a very long Chapter (~28,000 words) — the length that broke the full-parse path', () => {
    const text = buildChapterFixture(103);
    const medianMs = measureKeystroke(text);
    // eslint-disable-next-line no-console
    console.log(`~28,000 words (${text.length} chars): median ${medianMs.toFixed(2)}ms over 20 keystrokes (budget ${BUDGET_MS}ms).`);
    expect(medianMs).toBeLessThan(BUDGET_MS);
  });
});
