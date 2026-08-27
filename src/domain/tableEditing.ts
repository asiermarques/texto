import type { FormattingResult } from './inlineFormatting';
import type { SelectionRange } from './selectionOverlap';
import { paddedEmptyRow, readTable, type TableCellText, type TableShape } from './tablePadding';

/**
 * US-005 and US-006 of 009: writing a **Table** from the keyboard —
 * inserting an empty one, and moving between its **Cells** with Tab. Both
 * are pure: they answer "what change, and where does the selection go",
 * and `src/webview/main.ts` is the only place that turns either answer into
 * a real dispatch, the same split `linkEditing.ts` and `listContinuation.ts`
 * already use.
 */

/**
 * The skeleton an empty **Table** starts as: a **Header row**, a
 * **Delimiter row** and one empty **Row**, two columns, already in the
 * padded form US-003 maintains (OQ-002) — so the first keystroke inside it
 * has nothing to re-align, and a **Table** the **Author** never fills in
 * still reads as one in a diff.
 *
 * No placeholder text in the **Cells**. The `.md` is the source of truth
 * (PD-001) and it is the **Author**'s prose: words this editor invented,
 * in whichever language it happened to pick, are words they would have to
 * delete.
 */
const SKELETON = ['|   |   |', '|---|---|', '|   |   |'].join('\n');

/** Where the first **Cell**'s content sits inside `SKELETON`: past the opening pipe and its space. */
const FIRST_CELL_OFFSET = 2;

/**
 * US-005: the empty **Table** skeleton, written at the cursor as a block of
 * its own. A **Table** is a block construct, so it never lands inside the
 * **Paragraph** the cursor happens to be in — it opens a blank line below
 * it instead, and another one above whatever follows, which is what keeps
 * the result valid GFM rather than a **Paragraph** with pipes in it.
 */
export function insertTableSkeleton(text: string, pos: number): FormattingResult {
  const line = lineBoundsAt(text, pos);
  const blankLine = text.slice(line.from, line.to).trim().length === 0;
  // On a blank line the skeleton takes the line over, stray whitespace and
  // all; anywhere else it goes after the line the cursor is on, so the
  // Author's own sentence is never cut in half.
  const from = blankLine ? line.from : line.to;
  const to = line.to;

  const before = separator(text.slice(0, from), /(\n*)$/);
  const after = separator(text.slice(to), /^(\n*)/);
  const insert = `${before}${SKELETON}${after}`;
  const cursor = from + before.length + FIRST_CELL_OFFSET;

  return { changes: [{ from, to, insert }], selection: { anchor: cursor, head: cursor } };
}

/**
 * The newlines needed on one side of the skeleton so it is a block of its
 * own: two, less however many are already there — and none at all when
 * there is nothing on that side to be separated from.
 */
function separator(neighbour: string, existing: RegExp): string {
  if (neighbour.trim().length === 0) {
    return '';
  }
  return '\n'.repeat(Math.max(0, 2 - (existing.exec(neighbour)?.[1].length ?? 0)));
}

function lineBoundsAt(text: string, pos: number): SelectionRange {
  // `pos > 0` guard: `lastIndexOf` clamps a negative start to 0 and would
  // then find a newline sitting AT index 0, putting the cursor on the
  // second line of a Chapter that begins with one.
  const from = pos > 0 ? text.lastIndexOf('\n', pos - 1) + 1 : 0;
  const to = text.indexOf('\n', pos);
  return { from, to: to === -1 ? text.length : to };
}

/** Which way Tab was pressed: forward, or with Shift. */
export type CellDirection = 'next' | 'previous';

/**
 * US-006: where Tab (or Shift-Tab) goes from `pos`, and what it has to
 * write to get there. `null` when the range no longer holds a **Table**, so
 * the caller falls through to whatever Tab already does — the contract
 * `computeEnterContinuation` uses for Enter.
 *
 * The **Delimiter row** is not a stop: nothing in it is the **Author**'s
 * text. A cursor sitting on it is treated as sitting between the **Header
 * row** and the body, which is where it looks like it is.
 */
export function computeCellNavigation(text: string, range: SelectionRange, pos: number, direction: CellDirection): FormattingResult | null {
  const table = readTable(text, range);
  if (!table) {
    return null;
  }

  const stops = table.rows.flatMap((row, index) => (index === table.delimiterIndex ? [] : row.cells));
  if (stops.length === 0) {
    return null;
  }
  const target = stopIndex(stops, pos, direction);

  if (target >= stops.length) {
    return appendRow(table);
  }
  // Shift-Tab out of the first Cell would leave the Table, and Tab is not
  // how an Author leaves one: the selection stays where it is and the key
  // is spent, rather than falling through and putting a tab character in
  // the middle of a Row.
  return cursorAt(stops[Math.max(0, target)].from);
}

/**
 * Where in the list of **Cells** this keystroke starts from. A cursor
 * inside a **Cell** is that **Cell**; a cursor anywhere else in the
 * **Table** (on a pipe, in the padding, on the **Delimiter row**) belongs
 * to the last **Cell** that ended before it, which is what makes Tab off
 * the **Delimiter row** land in the first **Cell** of the body.
 */
function stopIndex(stops: readonly TableCellText[], pos: number, direction: CellDirection): number {
  const inside = stops.findIndex((cell) => pos >= cell.segmentFrom && pos <= cell.segmentTo);
  if (inside !== -1) {
    return direction === 'next' ? inside + 1 : inside - 1;
  }
  let before = -1;
  stops.forEach((cell, index) => {
    if (cell.segmentTo < pos) {
      before = index;
    }
  });
  return direction === 'next' ? before + 1 : before;
}

function appendRow(table: TableShape): FormattingResult {
  const lastRow = table.rows[table.rows.length - 1];
  const insert = `\n${paddedEmptyRow(table)}`;
  // Past the newline and the new Row's own "| ": its first Cell.
  const cursor = lastRow.to + 1 + FIRST_CELL_OFFSET;
  return { changes: [{ from: lastRow.to, to: lastRow.to, insert }], selection: { anchor: cursor, head: cursor } };
}

function cursorAt(pos: number): FormattingResult {
  return { changes: [], selection: { anchor: pos, head: pos } };
}
