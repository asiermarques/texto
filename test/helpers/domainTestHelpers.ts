import { parser } from '../../src/domain/markdownParser';
import { computeLivePreviewInstructions as computeLivePreviewInstructionsFromTree, type LivePreviewInstruction } from '../../src/domain/livePreview';
import { computeDimmedRanges as computeDimmedRangesFromTree } from '../../src/domain/focusMode';
import { countWordsInRange as countWordsInRangeFromTree } from '../../src/domain/wordCount';
import type { SelectionRange } from '../../src/domain/selectionOverlap';

/**
 * US-003 (008): the three pure analysers now take an already-parsed tree
 * instead of parsing `text` themselves (RISK-002's guard,
 * `test/unit/markdownParser.test.ts`, covers the parser itself). Every
 * vitest suite that exercised them by text alone — `livePreview.test.ts`
 * (573 lines), `focusMode.test.ts`, `wordCount.test.ts`,
 * `livePreviewLatency.test.ts` — still wants that same text-only call
 * shape, so this is the one place that parses on their behalf: swapping the
 * import for these wrappers is the whole migration, not a rewrite of every
 * call site (EDGE-004 of the requisites).
 */
export function computeLivePreviewInstructions(text: string, selection: SelectionRange): LivePreviewInstruction[] {
  return computeLivePreviewInstructionsFromTree(parser.parse(text), text, selection);
}

export function computeDimmedRanges(text: string, selection: SelectionRange): SelectionRange[] {
  return computeDimmedRangesFromTree(parser.parse(text), text, selection);
}

export function countWordsInRange(text: string, from: number, to: number): number {
  return countWordsInRangeFromTree(parser.parse(text), text, from, to);
}
