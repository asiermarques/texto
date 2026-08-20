import type { SyntaxNode, Tree } from '@lezer/common';
import { parser } from './markdownParser';

/**
 * US-020 (F-006): counts prose, not markdown. Structural syntax — heading
 * hashes, blockquote/list marks, emphasis asterisks, the Scene break's rule —
 * is excluded from the count entirely, by walking the same parser
 * `src/domain/livePreview.ts` uses rather than splitting the raw markdown on
 * whitespace: `## Título` is one word, not two, or the number would never
 * match what Google Docs shows for the same prose, which is what the Author
 * is going to compare it against.
 */
// FR-007 (006): a Code block's contents (CodeText, and its info string,
// CodeInfo), a Task's marker, a Footnote's call and label, and a whole
// Reference definition are not prose either — DEC-005. A FootnoteReference
// excludes the WHOLE call (marks and label together, like HorizontalRule
// does for "---") because the label ("1", "nota-a"…) is an identifier, not
// a word; a FootnoteDefinitionMark excludes only the "[^1]: " prefix,
// deliberately leaving the definition's own text countable — it is real
// prose the Author wrote, same as a Paragraph's.
const MARKER_TYPES = new Set([
  'HeaderMark',
  'QuoteMark',
  'ListMark',
  'EmphasisMark',
  'CodeMark',
  'LinkMark',
  'URL',
  'HorizontalRule',
  'CodeText',
  'CodeInfo',
  'TaskMarker',
  'FootnoteReference',
  'FootnoteDefinitionMark',
  'LinkReference',
]);

/**
 * Text-only convenience wrapper (US-003 of 008): the host
 * (`writingEditorProvider.ts`) has only the document's text, not a tree it
 * already owns, so this is the one place in `src/domain/` that still calls
 * `parser.parse` itself.
 */
export function countWords(text: string): number {
  return countWordsInRange(parser.parse(text), text, 0, text.length);
}

/**
 * Same rules as `countWords`, restricted to the `[from, to)` slice — used
 * for the Author's current selection. Takes the parse (`tree`) as an input
 * rather than producing it (US-003 of 008) — same split as
 * `computeLivePreviewInstructions`, for the same reason.
 */
export function countWordsInRange(tree: Tree, text: string, from: number, to: number): number {
  const prose = extractProseText(tree, text, from, to);
  return prose.split(/\s+/).filter((token) => token.length > 0).length;
}

/**
 * Lezer's markdown tree has no leaf node for plain prose — a heading's title
 * or a paragraph made only of an emphasis span leaves the gap between marks
 * uncovered by any node (livePreview.ts works the same way: content is the
 * arithmetic gap between two `EmphasisMark`s, never a node of its own). So
 * rather than collecting "real text" nodes, this collects the marker spans
 * to CUT OUT, and the prose is everything else — the same trick, generalised.
 */
function collectMarkerRanges(tree: Tree, from: number, to: number): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];

  function visit(node: SyntaxNode): void {
    if (node.from >= to || node.to <= from) {
      return;
    }
    if (MARKER_TYPES.has(node.type.name)) {
      ranges.push([node.from, node.to]);
      return; // marker nodes are leaves; nothing to recurse into
    }
    let child = node.firstChild;
    while (child) {
      visit(child);
      child = child.nextSibling;
    }
  }

  visit(tree.topNode);
  return ranges;
}

function extractProseText(tree: Tree, text: string, from: number, to: number): string {
  const ranges = [...collectMarkerRanges(tree, from, to)].sort((a, b) => a[0] - b[0]);
  let result = '';
  let cursor = from;
  for (const [rangeFrom, rangeTo] of ranges) {
    const clampedFrom = Math.max(rangeFrom, from);
    const clampedTo = Math.min(rangeTo, to);
    if (clampedFrom >= clampedTo || clampedFrom < cursor) {
      continue;
    }
    // Spliced out, not replaced by a separator: a mark can sit directly
    // against real text with no space of its own (`*cursiva*.`) — forcing a
    // space here would fabricate a word boundary that was never there and
    // split "cursiva." into two tokens.
    result += text.slice(cursor, clampedFrom);
    cursor = clampedTo;
  }
  result += text.slice(cursor, to);
  return result;
}

/**
 * US-006 (003): every template, already resolved for the display language.
 * This module stays free of `vscode` as a value (ASM-002), so it cannot call
 * `vscode.l10n.t` itself — `src/infrastructure/wordCountStatusBar.ts` is the
 * only place that does. Each string carries a literal `{0}` placeholder
 * (the same convention `vscode.l10n.t` itself uses), substituted by
 * `formatWordCountStatus` below.
 *
 * Spanish agrees the selection participle with a feminine noun
 * (seleccionada/seleccionadas, from "palabra") while English does not
 * inflect "selected" at all, so the selection suffix needs its own singular
 * and plural strings — a noun substituted into one shared skeleton cannot
 * express that, only whole per-language phrases can.
 */
export interface WordCountStrings {
  readonly totalSingular: string;
  readonly totalPlural: string;
  readonly selectionSingular: string;
  readonly selectionPlural: string;
}

function interpolate(template: string, value: number): string {
  return template.replace('{0}', String(value));
}

/** The exact string the status bar item shows (US-020). Singular/plural agreement included, in the display language. */
export function formatWordCountStatus(total: number, selected: number, strings: WordCountStrings): string {
  const totalLabel = interpolate(total === 1 ? strings.totalSingular : strings.totalPlural, total);
  if (selected <= 0) {
    return totalLabel;
  }
  const selectionLabel = interpolate(selected === 1 ? strings.selectionSingular : strings.selectionPlural, selected);
  return `${totalLabel} ${selectionLabel}`;
}
