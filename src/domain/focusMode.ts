import { markdownLanguage } from '@codemirror/lang-markdown';
import { type SelectionRange, touches } from './selectionOverlap';

/**
 * Focus mode (US-009): every top-level block (paragraph, heading, blockquote,
 * list, scene break…) that the current selection doesn't touch should be
 * dimmed. Pure — returns the ranges to dim; the webview's ViewPlugin turns
 * them into opacity-only `Decoration.mark`s (never touching layout).
 */
export function computeDimmedRanges(text: string, selection: SelectionRange): SelectionRange[] {
  const tree = markdownLanguage.parser.parse(text);
  const dimmed: SelectionRange[] = [];

  let block = tree.topNode.firstChild;
  while (block) {
    const range = { from: block.from, to: block.to };
    if (!touches(selection, range)) {
      dimmed.push(range);
    }
    block = block.nextSibling;
  }

  return dimmed;
}
