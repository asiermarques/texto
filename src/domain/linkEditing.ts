import type { SyntaxNode } from '@lezer/common';
import type { FormattingResult } from './inlineFormatting';
import { parser } from './markdownParser';
import type { SelectionRange } from './selectionOverlap';
import type { TextChange } from './textChange';

/** US-014: `Cmd`/`Ctrl`+`K` — wraps the selection as `[selection]()`, cursor left where the target goes. */
export function wrapSelectionAsLink(text: string, selection: SelectionRange): FormattingResult {
  const selected = text.slice(selection.from, selection.to);
  const insert = `[${selected}](`;
  const targetPos = selection.from + insert.length;
  return {
    changes: [{ from: selection.from, to: selection.to, insert: `${insert})` }],
    selection: { anchor: targetPos, head: targetPos },
  };
}

// The same heuristic CM6's own pasteURLAsLink extension uses: a scheme URL,
// or the bare "www." shorthand — not just "one word with no spaces", or
// pasting a single unusual word (a name, a code identifier) would silently
// turn it into a Link.
const URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+$/i;

/** US-014: whether a pasted string should turn the selection into a Link instead of replacing it as plain text. */
export function isLikelyUrl(candidate: string): boolean {
  const trimmed = candidate.trim();
  return trimmed.length > 0 && URL_PATTERN.test(trimmed);
}

function findLinkTextMatch(text: string, selection: SelectionRange): SyntaxNode | undefined {
  const tree = parser.parse(text);
  let match: SyntaxNode | undefined;
  tree.iterate({
    enter(node) {
      if (match || (node.type.name !== 'Link' && node.type.name !== 'Image')) {
        return;
      }
      const marks: SyntaxNode[] = [];
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.type.name === 'LinkMark') {
          marks.push(child);
        }
      }
      if (marks.length < 2) {
        return;
      }
      const [open, close] = marks;
      if (open.to === selection.from && close.from === selection.to) {
        match = node.node;
      }
    },
  });
  return match;
}

/**
 * US-014: pasting a URL over a selection turns it into a Link — unless the
 * selection already IS a composed Link's text (EDGE-007), in which case
 * only its target is replaced, so the Author's link text survives a
 * corrected paste instead of ending up nested inside a second Link.
 */
export function pasteUrlOverSelection(text: string, selection: SelectionRange, url: string): { readonly changes: readonly TextChange[] } {
  const existingLink = findLinkTextMatch(text, selection);
  if (existingLink) {
    const urlNode = childOf(existingLink, 'URL');
    if (urlNode) {
      return { changes: [{ from: urlNode.from, to: urlNode.to, insert: url }] };
    }
  }
  const selected = text.slice(selection.from, selection.to);
  return { changes: [{ from: selection.from, to: selection.to, insert: `[${selected}](${url})` }] };
}

function childOf(node: SyntaxNode, typeName: string): SyntaxNode | undefined {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.type.name === typeName) {
      return child;
    }
  }
  return undefined;
}
