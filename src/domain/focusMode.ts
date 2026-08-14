import { markdownLanguage } from '@codemirror/lang-markdown';
import { distance, type SelectionRange, touchesBlock } from './selectionOverlap';

/**
 * Focus mode (US-009): every top-level block (paragraph, heading, blockquote,
 * list, scene break…) that the current selection doesn't touch should be
 * dimmed. Pure — returns the ranges to dim; the webview's ViewPlugin turns
 * them into opacity-only `Decoration.mark`s (never touching layout).
 *
 * A cursor resting on a blank line belongs to no block at all. Dimming the
 * whole work then would blank the writing surface every time the author opens
 * a new paragraph, so the nearest block (the preceding one on a tie) keeps the
 * focus instead.
 */
export function computeDimmedRanges(text: string, selection: SelectionRange): SelectionRange[] {
  const tree = markdownLanguage.parser.parse(text);
  const blocks: SelectionRange[] = [];

  let block = tree.topNode.firstChild;
  while (block) {
    blocks.push({ from: block.from, to: block.to });
    block = block.nextSibling;
  }

  const focused = blocks.filter((range) => touchesBlock(selection, range));
  if (focused.length > 0) {
    return blocks.filter((range) => !focused.includes(range));
  }

  const nearest = nearestBlock(blocks, selection);
  return blocks.filter((range) => range !== nearest);
}

function nearestBlock(blocks: SelectionRange[], selection: SelectionRange): SelectionRange | undefined {
  let nearest: SelectionRange | undefined;
  let shortest = Number.POSITIVE_INFINITY;

  for (const range of blocks) {
    const gap = distance(selection, range);
    if (gap < shortest) {
      shortest = gap;
      nearest = range;
    }
  }

  return nearest;
}
