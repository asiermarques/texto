import { parser } from './markdownParser';
import type { TextChange } from './textChange';

/**
 * US-016: the edit a click on a composed Task's box produces — one
 * character, `[ ]`'s middle space flipped to `x` or back. Returns `null`
 * when `pos` does not land on a `TaskMarker`, so the caller (the webview's
 * `domEventHandlers`) knows an ordinary click landed elsewhere and should
 * fall through to CM6's normal cursor placement.
 */
export function toggleTaskMarkerAt(text: string, pos: number): TextChange | null {
  const tree = parser.parse(text);
  let marker: { from: number; to: number } | undefined;
  tree.iterate({
    enter(node) {
      if (node.type.name === 'TaskMarker' && pos >= node.from && pos <= node.to) {
        marker = { from: node.from, to: node.to };
        return false;
      }
    },
  });
  if (!marker) {
    return null;
  }
  const checked = text[marker.from + 1] !== ' ';
  return { from: marker.from + 1, to: marker.from + 2, insert: checked ? ' ' : 'x' };
}
