import { describe, expect, it } from 'vitest';
import { computeCellNavigation, insertTableSkeleton } from '../../src/domain/tableEditing';
import { applyChangesToText } from '../../src/domain/textChange';

/**
 * US-005 of 009: starting a **Table** without typing pipes and dashes blind
 * into text that hides them. A pure function returning the skeleton's
 * change and where the cursor lands, the shape `linkEditing.ts` and
 * `inlineFormatting.ts` already use — `src/webview/main.ts` is the only
 * place that turns it into a real dispatch.
 */

const SKELETON = ['|   |   |', '|---|---|', '|   |   |'].join('\n');

describe('insertTableSkeleton — US-005 of 009: insert a Table', () => {
  it('writes a valid, padded GFM skeleton on an empty line', () => {
    const result = insertTableSkeleton('', 0);

    expect(applyChangesToText('', result.changes)).toBe(SKELETON);
  });

  it('leaves the cursor in the first Cell of the Header row', () => {
    const result = insertTableSkeleton('', 0);
    const written = applyChangesToText('', result.changes);

    expect(result.selection).toEqual({ anchor: 2, head: 2 });
    expect(written.slice(0, result.selection.anchor)).toBe('| ');
  });

  it('opens a blank line of its own rather than splitting the Paragraph the cursor is in', () => {
    const text = 'Un párrafo entero.';
    const result = insertTableSkeleton(text, 3);

    expect(applyChangesToText(text, result.changes)).toBe(`Un párrafo entero.\n\n${SKELETON}`);
  });

  it('keeps a blank line between the Table and whatever follows it', () => {
    const text = 'Antes.\n\nDespués.';
    // The cursor at the end of the first Paragraph.
    const result = insertTableSkeleton(text, 'Antes.'.length);

    expect(applyChangesToText(text, result.changes)).toBe(`Antes.\n\n${SKELETON}\n\nDespués.`);
  });

  it('uses the blank line the cursor is already on without opening a second one', () => {
    const text = 'Antes.\n\nDespués.';
    const result = insertTableSkeleton(text, 7);

    expect(applyChangesToText(text, result.changes)).toBe(`Antes.\n\n${SKELETON}\n\nDespués.`);
  });

  it('does not open a blank line at the very start of a Chapter', () => {
    const text = '\nDespués.';
    const result = insertTableSkeleton(text, 0);

    expect(applyChangesToText(text, result.changes)).toBe(`${SKELETON}\n\nDespués.`);
  });

  it('puts the cursor in the first Cell wherever the skeleton ended up', () => {
    const text = 'Un párrafo entero.';
    const result = insertTableSkeleton(text, 3);
    const written = applyChangesToText(text, result.changes);

    expect(written.slice(result.selection.anchor - 2, result.selection.anchor)).toBe('| ');
    expect(written.indexOf(SKELETON) + 2).toBe(result.selection.anchor);
  });
});

/**
 * US-006 of 009: Tab and Shift-Tab move between **Cells** of the **Table**
 * holding the cursor, wrapping across **Rows**, and Tab in the last
 * **Cell** of the last **Row** appends one. `null` outside a **Table**, so
 * the caller falls through to whatever Tab does today — the same contract
 * `computeEnterContinuation` uses for Enter.
 */
describe('computeCellNavigation — US-006 of 009: move between Cells', () => {
  const TABLE = ['| Nombre | Rol          |', '|--------|--------------|', '| Ana    | Protagonista |'].join('\n');
  const RANGE = { from: 0, to: TABLE.length };

  const at = (text: string, needle: string, offset = 1) => text.indexOf(needle) + offset;

  it('moves to the next Cell of the same Row', () => {
    const result = computeCellNavigation(TABLE, RANGE, at(TABLE, 'Nombre'), 'next');

    expect(result?.changes).toEqual([]);
    expect(result?.selection.anchor).toBe(TABLE.indexOf('Rol'));
  });

  it('wraps to the first Cell of the next Row, stepping over the Delimiter row', () => {
    const result = computeCellNavigation(TABLE, RANGE, at(TABLE, 'Rol'), 'next');

    expect(result?.changes).toEqual([]);
    expect(result?.selection.anchor).toBe(TABLE.indexOf('Ana'));
  });

  it('appends a Row padded to the existing columns when there is no Cell left', () => {
    const result = computeCellNavigation(TABLE, RANGE, at(TABLE, 'Protagonista'), 'next');
    const grown = applyChangesToText(TABLE, result!.changes);

    expect(grown).toBe(`${TABLE}\n|        |              |`);
    // One space in from the new Row's opening pipe: its first Cell.
    expect(grown.slice(result!.selection.anchor - 2, result!.selection.anchor)).toBe('| ');
    expect(result!.selection.anchor).toBe(TABLE.length + 1 + 2);
  });

  it('moves back to the previous Cell of the same Row', () => {
    const result = computeCellNavigation(TABLE, RANGE, at(TABLE, 'Rol'), 'previous');

    expect(result?.selection.anchor).toBe(TABLE.indexOf('Nombre'));
  });

  it('moves back over the Delimiter row to the last Cell of the Row above', () => {
    const result = computeCellNavigation(TABLE, RANGE, at(TABLE, 'Ana'), 'previous');

    expect(result?.selection.anchor).toBe(TABLE.indexOf('Rol'));
  });

  it('stays put in the first Cell of the Header row, adding no Row and leaving no Table', () => {
    const result = computeCellNavigation(TABLE, RANGE, at(TABLE, 'Nombre'), 'previous');

    expect(result?.changes).toEqual([]);
    expect(result?.selection.anchor).toBe(TABLE.indexOf('Nombre'));
  });

  it('lands one space in from the opening pipe of an empty Cell', () => {
    const withGap = ['| a | b |', '|---|---|', '|   | x |'].join('\n');
    const result = computeCellNavigation(withGap, { from: 0, to: withGap.length }, at(withGap, 'b'), 'next');

    const lastRow = withGap.lastIndexOf('|   | x |');
    expect(result?.selection.anchor).toBe(lastRow + 2);
  });

  it('returns null when the range no longer holds a Table, so Tab keeps doing what it does today', () => {
    const notATable = 'Un párrafo con | un pipe suelto.';

    expect(computeCellNavigation(notATable, { from: 0, to: notATable.length }, 4, 'next')).toBeNull();
  });
});
