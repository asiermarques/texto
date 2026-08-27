import type { SyntaxNode, Tree } from '@lezer/common';
import type { SelectionRange } from './selectionOverlap';
import type { TextChange } from './textChange';

/**
 * US-003 of 009: the padded source. A **Table**'s markdown is kept aligned
 * in the file as the **Author** types in it, so the `.md` reads in a diff
 * and on GitHub without anyone padding it by hand — and, since FR-003
 * reveals the whole **Table** under the cursor, so the raw markdown the
 * **Author** is looking at while editing is the aligned form.
 *
 * **This supersedes BR-001 of requirement 006 for Tables only** (BR-001 of
 * 009). That rule said nothing writes bytes to the `.md` except an explicit
 * **Author** action; here a keystroke inside a **Cell** writes spaces into
 * every other **Row** as a consequence. Every other construct keeps 006's
 * rule unchanged. The padding travels in the SAME transaction as the
 * keystroke (`src/webview/main.ts`'s `tablePaddingFilter`), so one undo
 * never leaves a half-padded **Table** behind.
 *
 * OQ-002, answered by the **Author** before the first byte was written: the
 * padded form carries a leading and trailing pipe on every **Row**, and the
 * **Delimiter row**'s dashes fill the column's width — the form Prettier,
 * VSCode's own markdown formatter and GitHub's editor all produce, so a
 * **Chapter** padded here looks the same as one padded anywhere else. A
 * **Cell**'s content is always left in its column whatever the **Column
 * alignment** markers say: the markers move the composed grid (US-002), not
 * the bytes.
 */

/** One **Cell**: its content with the padding spaces trimmed off, and the raw span it sits in. */
export interface TableCellText {
  /** Start of the content itself — `| Ana |` gives a Cell of `Ana`, as the parser's own `TableCell` does. */
  readonly from: number;
  readonly to: number;
  readonly text: string;
  /** The whole span between this Cell's two pipes, padding included. */
  readonly segmentFrom: number;
  readonly segmentTo: number;
}

export interface TableRowText {
  readonly from: number;
  readonly to: number;
  readonly cells: readonly TableCellText[];
}

export interface TableShape {
  readonly rows: readonly TableRowText[];
  /** Which `rows` entry is the **Delimiter row** — always the second line of a GFM Table. */
  readonly delimiterIndex: number;
  readonly alignments: readonly ColumnAlignment[];
  readonly from: number;
}

type ColumnAlignment = 'left' | 'right' | 'center' | 'none';

export interface TablePaddingResult {
  readonly changes: readonly TextChange[];
  /** Where the cursor belongs once the changes are applied, in the padded document. */
  readonly cursor: number;
}

/** A **Delimiter row** segment: optional colon, one or more dashes, optional colon. */
const DELIMITER_SEGMENT = /^:?-+:?$/;

/**
 * The **Table** containing `pos`, or `null`. Detection goes through the
 * shared parser's own GFM nodes (ASM-002) — a **Paragraph** full of pipes
 * is not a **Table**, and only the parser knows the difference (BR-004).
 */
export function tableRangeAt(tree: Tree, pos: number): SelectionRange | null {
  const found = enclosingTable(tree.resolveInner(pos, -1)) ?? enclosingTable(tree.resolveInner(pos, 1));
  return found ? { from: found.from, to: found.to } : null;
}

function enclosingTable(node: SyntaxNode | null): SyntaxNode | null {
  for (let current = node; current; current = current.parent) {
    if (current.type.name === 'Table') {
      return current;
    }
  }
  return null;
}

/**
 * The spaces `range`'s **Table** needs so its columns line up, as changes
 * into `text`, plus where the cursor at `pos` belongs afterwards. `null`
 * when there is nothing to do — the **Table** is already padded, or the
 * range no longer holds one (the keystroke that triggered this may have
 * broken it, and BR-004 leaves a malformed **Table** alone).
 *
 * The changes are deliberately per-gap rather than per-line: only the
 * whitespace between the **Cells** is ever replaced, never a **Cell**'s own
 * characters (BR-003), which keeps the edit as small as the alignment
 * demands and leaves the **Author**'s text untouched under the cursor.
 */
export function computeTablePadding(text: string, range: SelectionRange, pos: number): TablePaddingResult | null {
  const table = readTable(text, range);
  if (!table) {
    return null;
  }

  const widths = columnWidths(table);
  const changes: TextChange[] = [];
  const targetLines: string[] = [];
  const contentOffsets: number[][] = [];

  table.rows.forEach((row, index) => {
    if (index === table.delimiterIndex) {
      const line = buildDelimiterRow(row.cells.length, widths, table.alignments);
      pushChange(text, changes, row.from, row.to, line);
      targetLines.push(line);
      contentOffsets.push([]);
      return;
    }
    const built = buildRow(text, row, widths, changes);
    targetLines.push(built.line);
    contentOffsets.push(built.offsets);
  });

  if (changes.length === 0) {
    return null;
  }
  return { changes, cursor: mapCursor(table, targetLines, contentOffsets, widths, pos) };
}

/**
 * The **Table**'s **Rows** and **Cells**, read off the text of a range the
 * parser has already vouched for. The **Cells** are split here rather than
 * taken from the tree's `TableCell` nodes because an empty **Cell** produces
 * no node at all — `|  | b |` hands over one `TableCell`, not two — and the
 * padding has to know which column that gap belongs to. Splitting on
 * unescaped pipes is GFM's own rule for where a **Cell** ends (EDGE-002: a
 * `\|` is content, and the parser agrees — it keeps the escape inside the
 * `TableCell`).
 */
export function readTable(text: string, range: SelectionRange): TableShape | null {
  const rows: TableRowText[] = [];
  let lineFrom = range.from;
  while (lineFrom <= range.to) {
    let lineTo = text.indexOf('\n', lineFrom);
    if (lineTo === -1 || lineTo > range.to) {
      lineTo = range.to;
    }
    rows.push({ from: lineFrom, to: lineTo, cells: splitRow(text, lineFrom, lineTo) });
    lineFrom = lineTo + 1;
  }
  // A range mapped through the keystroke that triggered this can reach one
  // line past the Table — an Author pressing Enter on its last Row is
  // leaving it, not adding a Row to it. A blank line is never part of a
  // GFM Table, so it is the honest place to stop.
  while (rows.length > 0 && text.slice(rows[rows.length - 1].from, rows[rows.length - 1].to).trim().length === 0) {
    rows.pop();
  }

  const delimiterIndex = 1;
  const delimiter = rows[delimiterIndex];
  if (!delimiter || rows.length < 2) {
    return null;
  }
  const alignments: ColumnAlignment[] = [];
  for (const cell of delimiter.cells) {
    if (!DELIMITER_SEGMENT.test(cell.text)) {
      return null;
    }
    const opens = cell.text.startsWith(':');
    const closes = cell.text.endsWith(':');
    alignments.push(opens && closes ? 'center' : closes ? 'right' : opens ? 'left' : 'none');
  }
  return { rows, delimiterIndex, alignments, from: range.from };
}

/**
 * Where the **Cells** of one line begin and end. The leading and trailing
 * pipes of a **Row** bound it rather than separating anything, so they are
 * dropped before the rest are read as column boundaries — a **Row** written
 * without them (`a | b`) has the same columns as one written with them.
 */
function splitRow(text: string, from: number, to: number): TableCellText[] {
  const line = text.slice(from, to);
  const bars: number[] = [];
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '|' && !isEscaped(line, index)) {
      bars.push(index);
    }
  }

  let start = 0;
  let end = line.length;
  const firstNonSpace = line.length - line.trimStart().length;
  if (bars.length > 0 && bars[0] === firstNonSpace) {
    start = bars.shift()! + 1;
  }
  const lastNonSpace = line.trimEnd().length - 1;
  if (bars.length > 0 && bars[bars.length - 1] === lastNonSpace && lastNonSpace >= start) {
    end = bars.pop()!;
  }

  const cells: TableCellText[] = [];
  let segmentFrom = start;
  for (const bar of [...bars, end]) {
    cells.push(makeCell(line, from, segmentFrom, bar));
    segmentFrom = bar + 1;
  }
  return cells;
}

function makeCell(line: string, lineFrom: number, segmentFrom: number, segmentTo: number): TableCellText {
  const segment = line.slice(segmentFrom, segmentTo);
  const leading = segment.length - segment.trimStart().length;
  const trimmed = segment.trim();
  // An empty Cell still needs somewhere to be: one space in from its
  // opening pipe, which is where the padded form puts it and where Tab
  // (US-006) leaves the cursor.
  const contentFrom = trimmed.length > 0 ? segmentFrom + leading : Math.min(segmentFrom + 1, segmentTo);
  return {
    from: lineFrom + contentFrom,
    to: lineFrom + contentFrom + trimmed.length,
    text: trimmed,
    segmentFrom: lineFrom + segmentFrom,
    segmentTo: lineFrom + segmentTo,
  };
}

function isEscaped(line: string, index: number): boolean {
  let backslashes = 0;
  for (let scan = index - 1; scan >= 0 && line[scan] === '\\'; scan--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/**
 * A column is as wide as its widest **Cell**, counted in code points —
 * EDGE-003: that aligns the source, which is what this story aligns, and
 * not the rendered width, which is US-001's grid's business (a **Cell** is
 * set in proportional type, where no character count is a width). Never
 * narrower than one character, or the **Delimiter row** would come out as
 * `::`, which is not a **Delimiter row** at all.
 */
function columnWidths(table: TableShape): number[] {
  const widths: number[] = [];
  table.rows.forEach((row, index) => {
    if (index === table.delimiterIndex) {
      return;
    }
    row.cells.forEach((cell, column) => {
      widths[column] = Math.max(widths[column] ?? 1, [...cell.text].length);
    });
  });
  return widths;
}

function buildRow(text: string, row: TableRowText, widths: readonly number[], changes: TextChange[]): { line: string; offsets: number[] } {
  let line = '|';
  let pending = '|';
  let gapFrom = row.from;
  const offsets: number[] = [];

  row.cells.forEach((cell, column) => {
    line += ' ';
    pending += ' ';
    offsets.push(line.length);
    if (cell.text.length > 0) {
      pushChange(text, changes, gapFrom, cell.from, pending);
      pending = '';
      gapFrom = cell.to;
    }
    line += cell.text;
    const fill = ' '.repeat(Math.max(0, (widths[column] ?? 1) - [...cell.text].length));
    line += `${fill} |`;
    pending += `${fill} |`;
  });

  pushChange(text, changes, gapFrom, row.to, pending);
  return { line, offsets };
}

/**
 * The **Delimiter row** rebuilt at the columns' widths, its **Column
 * alignment** markers exactly where the **Author** put them (BR-003) — a
 * `---:` stays a `---:`, only longer. It keeps its own column count too: a
 * ragged **Row** below it does not add a column to it.
 */
function buildDelimiterRow(columns: number, widths: readonly number[], alignments: readonly ColumnAlignment[]): string {
  let line = '|';
  for (let column = 0; column < columns; column++) {
    const inner = (widths[column] ?? 1) + 2;
    const alignment = alignments[column] ?? 'none';
    if (alignment === 'center') {
      line += `:${'-'.repeat(inner - 2)}:`;
    } else if (alignment === 'right') {
      line += `${'-'.repeat(inner - 1)}:`;
    } else if (alignment === 'left') {
      line += `:${'-'.repeat(inner - 1)}`;
    } else {
      line += '-'.repeat(inner);
    }
    line += '|';
  }
  return line;
}

function pushChange(text: string, changes: TextChange[], from: number, to: number, insert: string): void {
  if (text.slice(from, to) !== insert) {
    changes.push({ from, to, insert });
  }
}

/**
 * Where the cursor belongs in the padded **Table**. Computed from the
 * structure rather than left to the changes to carry it: the **Delimiter
 * row** has no content to anchor to, so a cursor editing an alignment
 * marker would otherwise be swept to the start of the line it is on.
 */
function mapCursor(
  table: TableShape,
  targetLines: readonly string[],
  contentOffsets: readonly number[][],
  widths: readonly number[],
  pos: number
): number {
  const index = table.rows.findIndex((row) => pos <= row.to);
  const rowIndex = index === -1 ? table.rows.length - 1 : index;
  const row = table.rows[rowIndex];
  let lineStart = table.from;
  for (let line = 0; line < rowIndex; line++) {
    lineStart += targetLines[line].length + 1;
  }

  const column = Math.max(
    0,
    row.cells.findIndex((cell) => pos <= cell.segmentTo)
  );
  if (rowIndex === table.delimiterIndex) {
    // Nothing in a Delimiter row is the Author's own text, so there is no
    // character to stay next to — the end of the column being edited is
    // where the marker goes, and so is where the cursor is wanted.
    let offset = 1;
    for (let scan = 0; scan <= column; scan++) {
      offset += (widths[scan] ?? 1) + 2 + (scan < column ? 1 : 0);
    }
    return lineStart + Math.min(offset, targetLines[rowIndex].length);
  }

  const cell = row.cells[column];
  if (!cell) {
    return lineStart;
  }
  const withinCell = Math.min(Math.max(pos - cell.from, 0), cell.text.length);
  return lineStart + contentOffsets[rowIndex][column] + withinCell;
}

/**
 * US-006 of 009: the empty **Row** Tab appends when it runs out of
 * **Cells**, already at the **Table**'s own column widths — so a **Table**
 * grown from the keyboard never leaves the file misaligned, and the padding
 * that follows the next keystroke finds nothing to do.
 *
 * Its column count comes from the **Delimiter row**, which is what decides
 * how many columns a GFM **Table** has: a ragged **Row** further down does
 * not add one.
 */
export function paddedEmptyRow(table: TableShape): string {
  const widths = columnWidths(table);
  const columns = table.rows[table.delimiterIndex].cells.length;
  let line = '|';
  for (let column = 0; column < columns; column++) {
    line += ` ${' '.repeat(widths[column] ?? 1)} |`;
  }
  return line;
}
