import type { SyntaxNode, Tree } from '@lezer/common';
import { type SelectionRange, touches, touchesBlock } from './selectionOverlap';
import { isDiagramInfo } from './diagram';

/**
 * What the Live preview should do to a range of the document. Pure
 * description, no `vscode`/CodeMirror view objects — the webview's
 * `ViewPlugin` (impure, DOM-facing) turns these into real `Decoration`s and
 * `EditorView.atomicRanges`.
 */
export type LivePreviewInstruction =
  | { readonly kind: 'hide'; readonly from: number; readonly to: number }
  // `title` (US-005/EDGE-003): a Link's target, carried so the webview can
  // set it as a native `title` attribute — the only way to keep the target
  // discoverable while it stays hidden, with no widget and no layout change.
  //
  // `attributes` (US-001 of 009): a Cell's width is computed per Table —
  // no fixed class can carry it — so it travels as a style attribute on
  // the same span. A value, like `title`, rather than a name.
  | { readonly kind: 'mark'; readonly from: number; readonly to: number; readonly class: string; readonly title?: string; readonly attributes?: Readonly<Record<string, string>> }
  // A whole-line class (list bullet, blockquote rail, heading level, scene
  // break). `from`/`to` sit anywhere inside the target line; the caller
  // resolves the actual line bounds via `doc.lineAt`.
  //
  // `attributes` (US-001 of 009): a Table's Rows are all one width, a value
  // only this analyser can work out — see `columnLayout`.
  | { readonly kind: 'line'; readonly from: number; readonly to: number; readonly class: string; readonly attributes?: Readonly<Record<string, string>> }
  // A Diagram (requirement 010, ADR 0004): the whole Code block, replaced by
  // the picture its `source` describes. The one instruction that is not
  // hide/mark/line over the Author's own characters — a diagram's shape is
  // not in the text, it is computed from it, so no amount of CSS over those
  // characters can draw it. `from`/`to` span the fence lines included; the
  // webview widens them to whole lines before replacing, the same way 'line'
  // resolves its own line bounds there.
  | { readonly kind: 'diagram'; readonly from: number; readonly to: number; readonly source: string };

// Every inline construct that composes as "hide two marks, style the content
// between them" — StrongEmphasis and Emphasis already did; Strikethrough
// (US-002) and InlineCode (US-003) are pure additions to the same shape.
const INLINE_MARK_NODES: Record<string, { markType: string; class: string; titleIsContent?: boolean }> = {
  StrongEmphasis: { markType: 'EmphasisMark', class: 'cm-live-strong' },
  Emphasis: { markType: 'EmphasisMark', class: 'cm-live-emphasis' },
  Strikethrough: { markType: 'StrikethroughMark', class: 'cm-live-strikethrough' },
  InlineCode: { markType: 'CodeMark', class: 'cm-live-code' },
  // US-005: `<https://example.com>` — an Autolink's two LinkMark children
  // ("<" and ">") bound the URL exactly the way an EmphasisMark pair bounds
  // its content, so the same shape composes it. `titleIsContent`: the
  // content IS the target here (EDGE-003 has nothing extra to reveal).
  Autolink: { markType: 'LinkMark', class: 'cm-live-link', titleIsContent: true },
  // US-012: `[^1]` — shaped exactly like Strikethrough/InlineCode (two marks
  // bounding content), so the call composes as a superscript for free.
  FootnoteReference: { markType: 'FootnoteReferenceMark', class: 'cm-live-footnote-ref' },
};

// What one character is worth when estimating a column's width, in `em` and
// deliberately not in `ch`: `ch` is the width of a "0" *in the element's own
// font*, so the Header row's heavier type resolved it differently from the
// body's and the columns drifted a few pixels apart. An `em` is the same
// length in every Cell of a column.
//
// Two rates, because a title and a Paragraph are not set the same way: the
// Header row is small caps tracked out by 0.08em a letter (styles.css), so
// a title costs measurably more per character than the prose under it —
// measured at ~0.575em against Literata's lowercase average of ~0.5em, and
// rounded up here so a title is never the thing that overflows.
const TITLE_CHARACTER_WIDTH = 0.62;
const BODY_CHARACTER_WIDTH = 0.55;

// Past this many characters a "word" is something else — a URL, a hash, a
// path — and a column has no business widening to hold it whole. It breaks
// like prose (`overflow-wrap`, styles.css) rather than pushing the Table
// off the page.
const LONGEST_PROTECTED_WORD = 14;

// The allowance on top of the characters themselves: the gutter the Cell
// carries (1.15em, styles.css) and a little slack.
const COLUMN_GUTTER = 1.25;

// US-010: nesting deeper than this shares the deepest defined class —
// styles.css only defines this many depth-specific rules.
const MAX_LIST_DEPTH_CLASS = 6;

/** 1 for a top-level list, 2 for a list nested inside a ListItem of another list, and so on. */
function listDepth(node: SyntaxNode): number {
  let depth = 1;
  let ancestor = node.parent;
  while (ancestor) {
    if (ancestor.type.name === 'BulletList' || ancestor.type.name === 'OrderedList') {
      depth++;
    }
    ancestor = ancestor.parent;
  }
  return depth;
}

/**
 * US-002 of 009: the extra class each column's Cells carry, read off the
 * Delimiter row ("|:---|---:|"). The parser hands that row over as a single
 * node, so the columns are split out of its text rather than read off nodes
 * of their own. An explicitly left-aligned column (":---") and an unmarked
 * one both come back empty: left is what a Cell already does.
 */
function columnAlignments(delimiterRow: string): string[] {
  return delimiterRow
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((spec) => {
      const trimmed = spec.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
        return ' cm-live-table-cell-center';
      }
      return trimmed.endsWith(':') ? ' cm-live-table-cell-right' : '';
    });
}

function lineBoundsAt(text: string, pos: number): SelectionRange {
  const from = text.lastIndexOf('\n', pos - 1) + 1;
  let to = text.indexOf('\n', pos);
  if (to === -1) {
    to = text.length;
  }
  return { from, to };
}

/**
 * The Composed subset (FR-002 of 001, extended by 006), composed as prose: markers hidden, structure styled —
 * except where the Author is currently working. Inline marks (emphasis,
 * strong) stay revealed while the selection is within the text they
 * emphasize; block markers (heading, blockquote, list, scene break) stay
 * revealed while the selection is anywhere on their physical line. Both
 * readings satisfy PD-001 ("revealed only on the cursor's line") for
 * block constructs, which *are* one line, while avoiding the inline case
 * where a single long paragraph would reveal every emphasis in it at once.
 *
 * Takes the parse (`tree`) as an input rather than producing it (US-003 of
 * 008): the tree answers "what construct is this and where does it start",
 * `text` answers "which characters are inside it" — both stay parameters so
 * this function never has to reach back for the document itself (AD-002).
 * Ownership of *producing* the tree belongs to the caller — the webview,
 * which owns it incrementally (US-004) — not to this pure analyser.
 */
export function computeLivePreviewInstructions(tree: Tree, text: string, selection: SelectionRange): LivePreviewInstruction[] {
  const instructions: LivePreviewInstruction[] = [];

  function skipSpaces(from: number, limit: number): number {
    let pos = from;
    while (pos < limit && text[pos] === ' ') {
      pos++;
    }
    return pos;
  }

  function hideMarkAndSpace(mark: SyntaxNode, limit: number): void {
    instructions.push({ kind: 'hide', from: mark.from, to: skipSpaces(mark.to, limit) });
  }

  // `touchesBlock`, not `touches`: a line's `to` is the position of its own
  // line break, so a cursor resting there is still ON that line — the next
  // line starts one position further on, so there is no ambiguity to
  // resolve. The half-open rule `touches` applies is right for an inline
  // marker (a cursor just past a `**` has moved on) and wrong here, and it
  // made a Code block's fence unreachable with the mouse: the whole fence
  // line is hidden, so it renders empty and a click anywhere on it resolves
  // to the line's end — exactly the position the half-open rule read as
  // "not on this line". The fence then never came back, and the Author had
  // no way to see or fix it (US-008's second acceptance criterion).
  function isActiveLine(pos: number): boolean {
    return touchesBlock(selection, lineBoundsAt(text, pos));
  }

  // US-008: a Code block's composed look (monospace, its own ground, never
  // justified) applies to every line it spans, always — the same
  // "composition doesn't depend on the cursor" rule DEC-003 already applies
  // to a heading's size or a blockquote's rail.
  function composeCodeBlockLines(node: SyntaxNode): void {
    let pos = node.from;
    for (;;) {
      const line = lineBoundsAt(text, pos);
      instructions.push({ kind: 'line', from: line.from, to: line.from, class: 'cm-live-codeblock' });
      if (line.to >= node.to) {
        break;
      }
      pos = line.to + 1;
    }
  }

  // Requirement 010. A Diagram is a Code block whose info string is
  // `mermaid` (`isDiagramInfo`): it composes as the picture its source
  // describes, and falls back to being an ordinary Code block — the caller
  // carries on down its own branch — whenever it must not, or cannot, be
  // one. Returns whether it composed.
  function composeDiagram(node: SyntaxNode): boolean {
    const info = childrenOf(node, 'CodeInfo')[0];
    if (!info || !isDiagramInfo(text.slice(info.from, info.to))) {
      return false;
    }

    // A Diagram reveals whole, exactly like a Table and for a stronger
    // reason: its source is a program, and a program read half-composed is
    // neither a picture nor something the Author can edit. `touchesBlock`,
    // so a cursor resting on the closing fence's own end still counts as
    // inside — that is where the Author lands after typing the last line.
    if (touchesBlock(selection, { from: node.from, to: node.to })) {
      return false;
    }

    // A Diagram replaces whole lines — the picture has no way to share one
    // with anything else, and the webview's replacement is only legal over
    // line boundaries. A fence indented into a list item starts mid-line, so
    // composing it would swallow the item's own marker: it stays an ordinary
    // Code block instead.
    if (node.from > 0 && text[node.from - 1] !== '\n') {
      return false;
    }

    // An empty fence is the Author mid-keystroke, having just opened the
    // block and not yet written what goes in it. There is no diagram to
    // draw, and replacing the fence with nothing would take the block they
    // are typing into off the screen.
    const body = childrenOf(node, 'CodeText')[0];
    const source = body ? text.slice(body.from, body.to) : '';
    if (source.trim() === '') {
      return false;
    }

    instructions.push({ kind: 'diagram', from: node.from, to: node.to, source });
    return true;
  }

  // US-001/US-002 of 009. The grid is CSS over the Author's own characters:
  // every pipe and every padding space is hidden, each Cell is marked, and
  // the Rows carry a line class the stylesheet turns into table rows. The
  // columns then line up because the browser lays them out, which is what
  // NOGOAL-001 of 006 ("the one construct that cannot be expressed as
  // hide/mark/line") did not account for — BR-002 of 009 authorised a
  // widget for this and it turned out not to be needed.
  function composeTable(node: SyntaxNode): void {
    // FR-003: a Table reveals whole. Not by line like every other block
    // construct — a Row's raw markdown is only readable next to the other
    // Rows' (the pipes have to line up with something), and a single Row
    // dropping out of the grid would reflow the columns under the cursor.
    if (touchesBlock(selection, { from: node.from, to: node.to })) {
      return;
    }

    // The Delimiter row is the one TableDelimiter that is a direct child of
    // the Table: the pipes bounding each Cell are TableDelimiters too, but
    // they hang off the TableHeader/TableRow they belong to.
    const delimiterRow = childrenOf(node, 'TableDelimiter')[0];
    const alignments = delimiterRow ? columnAlignments(text.slice(delimiterRow.from, delimiterRow.to)) : [];
    const columns = columnLayout(node);

    // Which Row closes the Table — its Header row, when nothing has been
    // written under the Delimiter row yet. A table in a well-set book is
    // ruled top, under the head and bottom, and only the analyser knows
    // which line the bottom one belongs to.
    // By position, not by identity: the tree hands out a fresh `SyntaxNode`
    // object on every access, so two references to the same Row are never
    // `===` each other.
    let lastRowFrom = -1;
    for (let row = node.firstChild; row; row = row.nextSibling) {
      if (row.type.name === 'TableHeader' || row.type.name === 'TableRow') {
        lastRowFrom = row.from;
      }
    }

    let child = node.firstChild;
    while (child) {
      const childName = child.type.name;
      if (childName === 'TableDelimiter') {
        // Composed, the Delimiter row is markup with nothing to show at
        // all. Both halves are needed: `hide` takes its text out of the
        // DOM (a `display: none` line still contributes its pipes to
        // `textContent`, which is what the Author's screen reader — and
        // the test protocol — would read), and the line class collapses
        // the empty line box that would otherwise sit between the Header
        // row and the body.
        instructions.push({ kind: 'hide', from: child.from, to: child.to });
        instructions.push({ kind: 'line', from: child.from, to: child.from, class: 'cm-live-table-delimiter' });
      } else if (childName === 'TableHeader' || childName === 'TableRow') {
        composeTableRow(child, alignments, columns, childName === 'TableHeader', child.from === lastRowFrom);
      }
      child = child.nextSibling;
    }
  }

  /**
   * The columns of one Row, as the spans between its pipes — not as its
   * `TableCell` children. A Cell with nothing in it produces no `TableCell`
   * node at all (`|  | b |` hands over ONE, not two), so counting nodes
   * gave the second column's Cell the first column's width and alignment,
   * and dropped an all-empty column out of the grid entirely. Found while
   * building US-005's empty skeleton, which is nothing but empty Cells.
   *
   * The leading and trailing pipes bound the Row rather than separating
   * anything, so the empty spans they leave at either end are not columns —
   * the same reading `tablePadding.ts` gives a Row written without them.
   */
  function rowColumns(row: SyntaxNode): { readonly from: number; readonly to: number; readonly cell: SyntaxNode | null }[] {
    const pipes: SyntaxNode[] = [];
    const cells: SyntaxNode[] = [];
    for (let child = row.firstChild; child; child = child.nextSibling) {
      if (child.type.name === 'TableDelimiter') {
        pipes.push(child);
      } else if (child.type.name === 'TableCell') {
        cells.push(child);
      }
    }
    const spans: { from: number; to: number }[] = [];
    let from = row.from;
    for (const pipe of pipes) {
      spans.push({ from, to: pipe.from });
      from = pipe.to;
    }
    spans.push({ from, to: row.to });
    if (spans.length > 1 && spans[0].from === spans[0].to) {
      spans.shift();
    }
    if (spans.length > 1 && spans[spans.length - 1].from === spans[spans.length - 1].to) {
      spans.pop();
    }
    return spans.map((span) => ({ ...span, cell: cells.find((cell) => cell.from >= span.from && cell.to <= span.to) ?? null }));
  }

  /**
   * How wide each column is, as a share of the measure. Every Cell of a
   * column is given the same share in every Row, which is what makes the
   * columns line up — the Rows themselves are unrelated line boxes to the
   * browser, and cannot be laid out together: CodeMirror renders a
   * `cm-widgetBuffer` around every hidden range and Focus mode wraps a
   * dimmed line's content in a span of its own, so a Cell is not reliably a
   * child of its Row at all. Only the Cell can carry the layout.
   *
   * Shares rather than absolute widths: a Cell is set in the Chapter's own
   * proportional type (ASM-001), where a character count is a decent ratio
   * and a poor width. A percentage of the measure also cannot overflow it
   * (OQ-001: a wide Table wraps and grows taller, it never bleeds into the
   * margins). The floor keeps a column of "#" beside one of prose from
   * collapsing to less than a character.
   */
  function columnLayout(table: SyntaxNode): { readonly row: string; readonly cells: readonly string[] } {
    const widths: number[] = [];
    // A column is never narrower than the title above it: a broken title
    // ("Per/son/aje") is the one thing a Table may not do to the Author's
    // words, so the Header row's Cells are a floor, not an average.
    const titles: number[] = [];
    // The longest single word in each column: a column narrower than this
    // breaks a word in half ("Pendien/te"), which is the same offence
    // against the Author's text as a broken title, one row further down.
    const words: number[] = [];
    let row = table.firstChild;
    while (row) {
      const isHeader = row.type.name === 'TableHeader';
      if (isHeader || row.type.name === 'TableRow') {
        rowColumns(row).forEach((span, column) => {
          // Code points, not UTF-16 units: "á" is one character on screen
          // however it is encoded. Never fewer than one: an all-empty
          // column is still a column, and the padded source floors it at
          // one character too (`tablePadding.ts`).
          const content = span.cell ? text.slice(span.cell.from, span.cell.to) : '';
          const width = Math.max(1, [...content].length);
          widths[column] = Math.max(widths[column] ?? 0, width);
          const longestWord = content
            .split(/\s+/)
            .reduce((longest, word) => Math.max(longest, [...word].length), 0);
          words[column] = Math.max(words[column] ?? 0, Math.min(longestWord, LONGEST_PROTECTED_WORD));
          if (isHeader) {
            titles[column] = width;
          }
        });
      }
      row = row.nextSibling;
    }
    // Two widths per column. The floor is whichever is wider: the title
    // above the column, or the longest word in it — prose longer than that
    // wraps, which is what prose does, while a single word never does. The
    // ceiling is the column's widest Cell: a book sets a table to the width
    // of its content and leaves the rest of the page alone, rather than
    // stretching two columns across the measure with the second stranded in
    // the middle.
    const floors = widths.map(
      (width, column) =>
        Math.max((titles[column] ?? width) * TITLE_CHARACTER_WIDTH, (words[column] ?? 0) * BODY_CHARACTER_WIDTH) + COLUMN_GUTTER
    );
    const ceilings = widths.map((width, column) => Math.max(width * BODY_CHARACTER_WIDTH + COLUMN_GUTTER, floors[column]));
    const totalCeiling = ceilings.reduce((sum, width) => sum + width, 0);
    const totalFloor = floors.reduce((sum, width) => sum + width, 0);

    return {
      // The Row's own width, and the reason the columns line up at all: a
      // Cell's share is a percentage, and a percentage needs something
      // definite to be a percentage OF. Left to `fit-content` the Row is a
      // shrink-to-fit box — the shares stop resolving, every Row sizes
      // itself to its own text, and a Row of short Cells comes out narrower
      // than the one below it. (The rules live on the Row, so that also
      // stopped them from spanning the whole Table.)
      //
      // The clamp reads: as wide as the content wants, never wider than the
      // measure — unless not even the floors fit, in which case the Table is
      // as wide as its floors and reaches into the margins rather than
      // breaking a title or a word.
      row: `width: clamp(${round(totalFloor)}em, ${round(totalCeiling)}em, 100%)`,
      cells: ceilings.map((ceiling, column) => {
        // Floored, never rounded: the shares have to stay under 100%
        // together, or the last Cell of every Row wraps onto its own line.
        const share = Math.floor((ceiling / totalCeiling) * 10000) / 100;
        return `width: ${share}%; min-width: ${round(floors[column])}em; max-width: ${round(ceiling)}em`;
      }),
    };
  }

  function round(width: number): number {
    return Math.round(width * 100) / 100;
  }

  function composeTableRow(
    row: SyntaxNode,
    alignments: readonly string[],
    columns: { readonly row: string; readonly cells: readonly string[] },
    isHeader: boolean,
    isLast: boolean
  ): void {
    instructions.push({ kind: 'line', from: row.from, to: row.from, class: 'cm-live-table-row', attributes: { style: columns.row } });
    if (isHeader) {
      instructions.push({ kind: 'line', from: row.from, to: row.from, class: 'cm-live-table-header' });
    }
    if (isLast) {
      instructions.push({ kind: 'line', from: row.from, to: row.from, class: 'cm-live-table-last-row' });
    }

    // Hiding the gaps between the Cells, rather than the pipe nodes
    // themselves, is what takes the padding spaces with them: a TableCell's
    // range stops at its text ("| Ana |" gives a Cell of "Ana"), so hiding
    // only the pipes would leave the Author's padding — the very spaces
    // US-003 will be maintaining — sitting inside the composed column.
    let pos = row.from;
    rowColumns(row).forEach((span, column) => {
      // An empty Cell has no characters of its own to mark, so its column's
      // whole span — the padding spaces between its two pipes — carries the
      // box instead. Without it the column has nowhere to hang its width
      // and drops out of the grid, which is every column of a freshly
      // inserted skeleton (US-005).
      const from = span.cell ? span.cell.from : span.from;
      const to = span.cell ? span.cell.to : span.to;
      if (pos < from) {
        instructions.push({ kind: 'hide', from: pos, to: from });
      }
      if (from < to) {
        instructions.push({
          kind: 'mark',
          from,
          to,
          class: `cm-live-table-cell${alignments[column] ?? ''}`,
          attributes: columns.cells[column] !== undefined ? { style: columns.cells[column] } : undefined,
        });
      }
      pos = to;
    });
    if (pos < row.to) {
      instructions.push({ kind: 'hide', from: pos, to: row.to });
    }
  }

  function visit(parent: SyntaxNode): void {
    let child = parent.firstChild;
    while (child) {
      handle(child);
      child = child.nextSibling;
    }
  }

  function handle(node: SyntaxNode): void {
    const name = node.type.name;

    if (name in INLINE_MARK_NODES) {
      const { markType, class: markClass, titleIsContent } = INLINE_MARK_NODES[name];
      const marks = childrenOf(node, markType);
      if (marks.length === 2) {
        const content = { from: marks[0].to, to: marks[1].from };
        // `content.from < content.to`: an empty construct (`~~~~`, `` `` ``)
        // has nothing to mark — CodeMirror's `Decoration.mark` throws on a
        // zero-length range, which would otherwise take down every
        // decoration in the document, not just this one (RISK-004 in
        // miniature: a single bad instruction must not poison the whole
        // build). Left raw is the only sensible reading anyway: there is no
        // "content" to compose.
        if (content.from < content.to && !touches(selection, content)) {
          instructions.push({ kind: 'hide', from: marks[0].from, to: marks[0].to });
          instructions.push({ kind: 'hide', from: marks[1].from, to: marks[1].to });
          instructions.push({
            kind: 'mark',
            from: content.from,
            to: content.to,
            class: markClass,
            title: titleIsContent ? text.slice(content.from, content.to) : undefined,
          });
        }
      }
      visit(node);
      return;
    }

    if (name === 'Link' || name === 'Image') {
      const marks = childrenOf(node, 'LinkMark');
      if (marks.length >= 2) {
        const [openMark, closeMark] = marks;
        const content = { from: openMark.to, to: closeMark.from };
        // Unlike a simple wrap-marker (Strong, Emphasis: reveal only while
        // the cursor is in the text between the two marks), a Link has a
        // whole extra part after the text — "(url)" or "[ref]" — that the
        // Author is still actively typing or fixing. Gating reveal on just
        // `content` collapsed the Link the instant the cursor moved into
        // that part (typing "(" already pushed it out of `content`),
        // hiding the very thing being edited. `touchesBlock` over the
        // WHOLE node keeps it revealed anywhere inside `[text](url)`,
        // cursor included right after the closing ")" — a plain `touches`
        // there already reads as "moved past" (the emphasis convention),
        // which is one keystroke too eager for something with this much
        // more to type after the visible text. It still collapses the
        // moment the Author actually moves on: a space typed after it, the
        // selection landing elsewhere, a new line.
        //
        // `content.from < content.to`: an empty Link/Image text (`[](url)`,
        // `![](url)` — what `Cmd+K`/US-014 produces before the Author types
        // anything) has nothing to mark. Left raw rather than collapsed:
        // hiding an empty span would leave nothing at all on screen to
        // click back into, and `Decoration.mark` throws on a zero-length
        // range regardless — one bad instruction must not take down every
        // decoration in the document.
        if (content.from < content.to && !touchesBlock(selection, { from: node.from, to: node.to })) {
          const url = childrenOf(node, 'URL')[0];
          instructions.push({ kind: 'hide', from: openMark.from, to: openMark.to });
          instructions.push({ kind: 'hide', from: closeMark.from, to: node.to });
          instructions.push({
            kind: 'mark',
            from: content.from,
            to: content.to,
            class: name === 'Image' ? 'cm-live-image' : 'cm-live-link',
            title: url ? text.slice(url.from, url.to) : undefined,
          });
        }
      }
      visit(node);
      return;
    }

    // US-005: a bare URL (GFM's autolink extension, no brackets typed at
    // all) is only composed at the top level — nested inside a Link/Image
    // it is the target, already folded into that node's hide-after-the-text
    // range above; nested inside an Autolink it is that node's own content,
    // already marked by the INLINE_MARK_NODES branch.
    if (name === 'URL') {
      const parentName = node.parent?.type.name;
      if (parentName !== 'Link' && parentName !== 'Image' && parentName !== 'Autolink') {
        instructions.push({ kind: 'mark', from: node.from, to: node.to, class: 'cm-live-link', title: text.slice(node.from, node.to) });
      }
      return;
    }

    if (name === 'Escape') {
      // The node is the backslash plus the one character it escapes
      // (`\*`): the "text it marks" (FR-002) is that single character, so
      // the backslash hides unless the cursor sits on the character itself.
      const escaped = { from: node.from + 1, to: node.to };
      if (!touches(selection, escaped)) {
        instructions.push({ kind: 'hide', from: node.from, to: node.from + 1 });
      }
      return;
    }

    if (name === 'SetextHeading1' || name === 'SetextHeading2') {
      // DEC-003: the parser already resolves the "---" ambiguity by itself
      // (CommonMark reads a bare "---" right under a Paragraph as this
      // node, and only a "---" with a blank line above it as a
      // HorizontalRule) — composing this node the way ATXHeading already is
      // is the whole fix. Same typography as its ATX equivalent (DEC-003 of
      // the plan); the underline is markup, not part of the title, so
      // composition (the heading class) applies only to the title's own
      // line, not to the underline's.
      const level = name === 'SetextHeading1' ? '1' : '2';
      instructions.push({ kind: 'line', from: node.from, to: node.from, class: `cm-live-heading-${level}` });
      const mark = childrenOf(node, 'HeaderMark')[0];
      if (mark && !isActiveLine(mark.from)) {
        instructions.push({ kind: 'hide', from: mark.from, to: mark.to });
      }
      visit(node);
      return;
    }

    if (name.startsWith('ATXHeading')) {
      const level = name.slice('ATXHeading'.length);
      // Composition (size, weight) is not the cursor's business — DEC-003:
      // it stays applied whether or not the marker is currently hidden.
      instructions.push({ kind: 'line', from: node.from, to: node.to, class: `cm-live-heading-${level}` });
      if (!isActiveLine(node.from)) {
        const mark = childrenOf(node, 'HeaderMark')[0];
        if (mark) {
          hideMarkAndSpace(mark, node.to);
        }
      }
      visit(node);
      return;
    }

    if (name === 'Blockquote') {
      // Continuation lines nest their QuoteMark inside the Blockquote's
      // Paragraph child, not as a direct child of Blockquote — descend
      // through the whole subtree, not just direct children.
      for (const mark of descendantsOf(node, 'QuoteMark')) {
        // The rail (composition) stays on every line of the blockquote,
        // active or not — only the raw ">" marker depends on the cursor.
        instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-blockquote' });
        if (!isActiveLine(mark.from)) {
          hideMarkAndSpace(mark, node.to);
        }
      }
      visit(node);
      return;
    }

    if (name === 'BulletList' || name === 'OrderedList') {
      // US-010: how many BulletList/OrderedList ancestors sit above this
      // one — 1 for a top-level list, 2 for one nested inside it, and so
      // on. Capped so a pathologically deep outline still resolves to a
      // real, defined CSS class instead of an ever-growing one.
      const depth = Math.min(listDepth(node), MAX_LIST_DEPTH_CLASS);
      for (const item of childrenOf(node, 'ListItem')) {
        const mark = childrenOf(item, 'ListMark')[0];
        if (mark) {
          if (name === 'BulletList') {
            // Composition (the indent carved out by text-indent) stays
            // always; the "•" marker-substitute only appears while the real
            // dash is hidden, or both would show at once.
            instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-list-bullet' });
            if (!isActiveLine(mark.from)) {
              hideMarkAndSpace(mark, item.to);
              instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-list-bullet-mark' });
            }
          } else {
            // The number is real text, always visible — no marker to hide,
            // so no cursor dependency at all.
            instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-list-number' });
          }
          instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: `cm-live-list-depth-${depth}` });
        }
        visit(item);
      }
      return;
    }

    if (name === 'Task') {
      // DEC-002: the box is the Author's own "[ ]"/"[x]" characters,
      // composed by CSS on this same mark — never hidden by a `hide`
      // instruction (which would remove it from the DOM and put it out of
      // domEventHandlers' reach for US-016's click-to-toggle), and never
      // gated on the cursor: the checkbox has to be there to click, even
      // while the cursor sits on its own line.
      const marker = childrenOf(node, 'TaskMarker')[0];
      if (marker) {
        const checked = text[marker.from + 1] !== ' ';
        instructions.push({
          kind: 'mark',
          from: marker.from,
          to: marker.to,
          class: checked ? 'cm-live-task cm-live-task-checked' : 'cm-live-task cm-live-task-unchecked',
        });
      }
      visit(node);
      return;
    }

    if (name === 'FencedCode') {
      if (composeDiagram(node)) {
        return;
      }
      composeCodeBlockLines(node);
      const [openMark, closeMark] = childrenOf(node, 'CodeMark');
      if (openMark && !isActiveLine(openMark.from)) {
        const info = childrenOf(node, 'CodeInfo')[0];
        instructions.push({ kind: 'hide', from: openMark.from, to: info ? info.to : openMark.to });
      }
      if (closeMark && !isActiveLine(closeMark.from)) {
        instructions.push({ kind: 'hide', from: closeMark.from, to: closeMark.to });
      }
      return;
    }

    if (name === 'FootnoteDefinition' || name === 'LinkReference') {
      // US-012: apparatus, not prose — composed as a discreet block (FR-001)
      // by styling alone, always applied like a heading's size (DEC-003).
      // The marker ("[^1]:" / "[ref]:") stays visible rather than hidden:
      // unlike a Task's box or a heading's hash, it is the only label the
      // Author has for which note or reference this is, so unlike those it
      // is real content, not decoration to hide.
      instructions.push({ kind: 'line', from: node.from, to: node.from, class: 'cm-live-apparatus' });
      visit(node);
      return;
    }

    if (name === 'CodeBlock') {
      // The indented form has no fence to hide — CommonMark's marker IS the
      // leading whitespace, which stays exactly as written (DEC-004) and
      // simply renders as part of the composed line.
      composeCodeBlockLines(node);
      return;
    }

    if (name === 'Table') {
      composeTable(node);
      return;
    }

    if (name === 'HorizontalRule') {
      // Composition reserves the line's height and centring always, so the
      // neighbouring lines never shift when the raw "---" replaces the "⁂".
      instructions.push({ kind: 'line', from: node.from, to: node.to, class: 'cm-live-scene-break' });
      if (!isActiveLine(node.from)) {
        instructions.push({ kind: 'hide', from: node.from, to: node.to });
        instructions.push({ kind: 'line', from: node.from, to: node.to, class: 'cm-live-scene-break-mark' });
      }
      return;
    }

    // Anything else (Paragraph, Document, plain text, …) isn't
    // part of the rendered subset: recurse in case one of our node types
    // appears nested inside it, but never decorate the node itself
    // (BR-002/EDGE-002 — it stays exactly as written).
    visit(node);
  }

  function childrenOf(node: SyntaxNode, typeName: string): SyntaxNode[] {
    const result: SyntaxNode[] = [];
    let child = node.firstChild;
    while (child) {
      if (child.type.name === typeName) {
        result.push(child);
      }
      child = child.nextSibling;
    }
    return result;
  }

  function descendantsOf(node: SyntaxNode, typeName: string): SyntaxNode[] {
    const result: SyntaxNode[] = [];
    let child = node.firstChild;
    while (child) {
      if (child.type.name === typeName) {
        result.push(child);
      } else {
        result.push(...descendantsOf(child, typeName));
      }
      child = child.nextSibling;
    }
    return result;
  }

  visit(tree.topNode);
  instructions.sort((a, b) => a.from - b.from);
  return instructions;
}
