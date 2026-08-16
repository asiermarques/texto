import type { SyntaxNode } from '@lezer/common';
import type { FormattingResult } from './inlineFormatting';
import { parser } from './markdownParser';
import type { SelectionRange } from './selectionOverlap';

// Order matters: a Task line ("- [ ] …") also matches BULLET_LINE, so it
// has to be tried first or every Task would continue as a plain bullet.
const TASK_LINE = /^(\s*[-*+]\s)\[[ xX]\](\s)/;
const ORDERED_LINE = /^(\s*)(\d+)([.)])(\s)/;
const BULLET_LINE = /^(\s*)([-*+])(\s)/;
const QUOTE_LINE = /^(\s*)(>)(\s?)/;

function lineBoundsAt(text: string, pos: number): SelectionRange {
  const from = text.lastIndexOf('\n', pos - 1) + 1;
  let to = text.indexOf('\n', pos);
  if (to === -1) {
    to = text.length;
  }
  return { from, to };
}

/**
 * US-015: what Enter should do instead of inserting a plain newline, when
 * `pos` sits inside a list item, a Task or a blockquote — `null` when it
 * doesn't, so the caller falls through to the ordinary Enter behaviour.
 *
 * The tree only answers "am I inside a ListItem/Blockquote at all" (context
 * is genuinely structural — a "1. " at the start of a Code block's line
 * must not continue as a list); once that's confirmed, the marker itself is
 * read straight off `pos`'s own line with a regex rather than off the
 * parser's node offsets — simpler, and it naturally reuses the Author's own
 * bullet character/delimiter instead of a hard-coded one.
 */
export function computeEnterContinuation(text: string, pos: number): FormattingResult | null {
  const tree = parser.parse(text);
  let node: SyntaxNode | null = tree.resolveInner(pos, -1);
  let inListItem = false;
  let inBlockquote = false;
  while (node) {
    if (node.type.name === 'ListItem') {
      inListItem = true;
      break;
    }
    if (node.type.name === 'Blockquote') {
      inBlockquote = true;
      break;
    }
    node = node.parent;
  }
  if (!inListItem && !inBlockquote) {
    return null;
  }

  const line = lineBoundsAt(text, pos);
  const lineText = text.slice(line.from, line.to);

  if (inListItem) {
    const task = TASK_LINE.exec(lineText);
    if (task) {
      return buildContinuation(text, pos, line, task[0].length, `${task[1]}[ ]${task[2]}`);
    }
    const ordered = ORDERED_LINE.exec(lineText);
    if (ordered) {
      const [, indent, digits, delimiter, space] = ordered;
      return buildContinuation(text, pos, line, ordered[0].length, `${indent}${Number(digits) + 1}${delimiter}${space}`);
    }
    const bullet = BULLET_LINE.exec(lineText);
    if (bullet) {
      const [, indent, mark, space] = bullet;
      return buildContinuation(text, pos, line, bullet[0].length, `${indent}${mark}${space}`);
    }
    return null;
  }

  const quote = QUOTE_LINE.exec(lineText);
  if (quote) {
    const [, indent, mark, space] = quote;
    return buildContinuation(text, pos, line, quote[0].length, `${indent}${mark}${space || ' '}`);
  }
  return null;
}

function buildContinuation(text: string, pos: number, line: SelectionRange, prefixLength: number, marker: string): FormattingResult {
  const rest = text.slice(line.from + prefixLength, line.to);
  if (rest.trim().length === 0) {
    // An empty item: Enter here means "I'm done with this list/quote", not
    // "give me another item" — remove the marker and land on the now-blank line.
    return {
      changes: [{ from: line.from, to: line.to, insert: '' }],
      selection: { anchor: line.from, head: line.from },
    };
  }
  const insert = `\n${marker}`;
  return {
    changes: [{ from: pos, to: pos, insert }],
    selection: { anchor: pos + insert.length, head: pos + insert.length },
  };
}
