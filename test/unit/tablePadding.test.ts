import { describe, expect, it } from 'vitest';
import { computeTablePadding } from '../helpers/domainTestHelpers';
import { applyChangesToText } from '../../src/domain/textChange';

/**
 * US-003 of 009: the padded source. `computeTablePadding` answers "what
 * spaces does this Table need so its columns line up in the file", as
 * `TextChange`s the caller dispatches in the SAME transaction as the
 * keystroke that caused them (BR-001: one undo step). `null` when the
 * position is not inside a Table, and `null` when the Table is already
 * padded — the same "nothing to do" contract `taskToggle.ts` and
 * `listContinuation.ts` use.
 *
 * OQ-002, answered by the Author before this was written: the padded form
 * carries a leading and trailing pipe on every Row, and the Delimiter row's
 * dashes fill the column's width. Cell contents are always left-aligned in
 * the source whatever the Column alignment markers say — the markers move
 * the composed grid (US-002), not the bytes.
 */
function pad(text: string, pos: number): string | null {
  const result = computeTablePadding(text, pos);
  return result === null ? null : applyChangesToText(text, result.changes);
}

describe('computeTablePadding — US-003 of 009: the padded source', () => {
  it('pads every Cell to its column\'s widest Cell and the Delimiter row to match', () => {
    const text = '| Nombre | Rol |\n|-|-|\n| Ana | Protagonista |';

    expect(pad(text, text.indexOf('Ana'))).toBe(
      ['| Nombre | Rol          |', '|--------|--------------|', '| Ana    | Protagonista |'].join('\n')
    );
  });

  it('leaves an already padded Table alone, so typing outside it costs nothing', () => {
    const text = ['| Nombre | Rol          |', '|--------|--------------|', '| Ana    | Protagonista |'].join('\n');

    expect(computeTablePadding(text, text.indexOf('Ana'))).toBeNull();
  });

  it('returns null for a position in a Paragraph outside any Table', () => {
    const text = 'Un párrafo.\n\n| a | b |\n|-|-|\n| 1 | 2 |';

    expect(computeTablePadding(text, 3)).toBeNull();
  });

  it('returns null for a half-written Table that has no Delimiter row yet', () => {
    const text = '| a | b';

    expect(computeTablePadding(text, 4)).toBeNull();
  });

  it('preserves the Column alignment markers and grows their dashes to the column width', () => {
    const text = '| Concepto | Importe |\n|:-|-:|\n| Anticipo | 1.200 |';

    expect(pad(text, text.indexOf('Anticipo'))).toBe(
      ['| Concepto | Importe |', '|:---------|--------:|', '| Anticipo | 1.200   |'].join('\n')
    );
  });

  it('preserves a centred column\'s markers on both sides', () => {
    const text = '| Turno | Hora |\n|:-:|-|\n| Mañana | 9.00 |';

    expect(pad(text, text.indexOf('Mañana'))).toBe(
      ['| Turno  | Hora |', '|:------:|------|', '| Mañana | 9.00 |'].join('\n')
    );
  });

  it('does not right-align a Cell in the source just because its column is marked ---:', () => {
    const text = '| Concepto | Importe |\n|-|-:|\n| Anticipo | 1.200 |\n| Liquidación | 18.400 |';

    expect(pad(text, text.indexOf('Anticipo'))).toBe(
      [
        '| Concepto    | Importe |',
        '|-------------|--------:|',
        '| Anticipo    | 1.200   |',
        '| Liquidación | 18.400  |',
      ].join('\n')
    );
  });

  it('gives a Row written without outer pipes the padded form\'s leading and trailing pipe', () => {
    const text = 'a | b\n-|-\n1 | 2';

    expect(pad(text, text.indexOf('1'))).toBe(['| a | b |', '|---|---|', '| 1 | 2 |'].join('\n'));
  });

  it('treats an escaped pipe as Cell content, not as a column boundary', () => {
    const text = '| a \\| x | b |\n|-|-|\n| 1 | 2 |';
    const padded = pad(text, text.indexOf('x'));

    expect(padded).toBe(['| a \\| x | b |', '|--------|---|', '| 1      | 2 |'].join('\n'));
  });

  it('keeps a ragged Row\'s own Cell count instead of filling it out', () => {
    const text = '| a | b |\n|-|-|\n| 1 |\n| 1 | 2 | 3 |';

    expect(pad(text, text.indexOf('1'))).toBe(['| a | b |', '|---|---|', '| 1 |', '| 1 | 2 | 3 |'].join('\n'));
  });

  it('pads an empty Cell to its column\'s width', () => {
    const text = '| a | b |\n|-|-|\n|  | dos |';

    expect(pad(text, text.indexOf('dos'))).toBe(['| a | b   |', '|---|-----|', '|   | dos |'].join('\n'));
  });

  it('measures a Cell in code points, so an accented character counts as one', () => {
    const text = '| á | b |\n|-|-|\n| aa | c |';

    expect(pad(text, text.indexOf('aa'))).toBe(['| á  | b |', '|----|---|', '| aa | c |'].join('\n'));
  });

  it('only ever adds or removes spaces — never a Cell\'s own characters', () => {
    const text = '| Nombre  |    Rol |\n| --- | --- |\n|Ana|  Protagonista|';
    const padded = pad(text, text.indexOf('Ana'));

    // Every Row but the Delimiter row, stripped of spaces: the Delimiter
    // row's dashes DO change (they follow the column width), the Cells'
    // own characters never do.
    const rowsWithoutSpaces = (value: string) =>
      value
        .split('\n')
        .filter((_line, index) => index !== 1)
        .map((line) => line.replace(/ /g, ''));
    expect(rowsWithoutSpaces(padded ?? '')).toEqual(rowsWithoutSpaces(text));
  });

  it('keeps the cursor on the character it was next to, however the padding moved it', () => {
    const text = '| Nombre | Rol |\n|-|-|\n| Ana | Protagonista |';
    // Between the "A" and the "n" of "Ana".
    const result = computeTablePadding(text, text.indexOf('Ana') + 1);
    const padded = applyChangesToText(text, result!.changes);

    expect(padded.slice(result!.cursor - 1, result!.cursor + 2)).toBe('Ana'.slice(0, 1) + 'na');
    expect(result!.cursor).toBe(padded.indexOf('Ana') + 1);
  });

  it('leaves the cursor inside its own Cell when the padding shrinks the column', () => {
    const text = ['| Nombre | Rol          |', '|--------|--------------|', '| Ana    | Protagonista |'].join('\n');
    // Delete "Protagonista" down to "Prota": the second column narrows.
    const shrunk = text.replace('Protagonista', 'Prota');
    const result = computeTablePadding(shrunk, shrunk.indexOf('Prota') + 'Prota'.length);
    const padded = applyChangesToText(shrunk, result!.changes);

    expect(padded).toBe(['| Nombre | Rol   |', '|--------|-------|', '| Ana    | Prota |'].join('\n'));
    expect(result!.cursor).toBe(padded.indexOf('Prota') + 'Prota'.length);
  });

  it('pads a Table that sits between other blocks without touching them', () => {
    const text = 'Antes.\n\n| a | bb |\n|-|-|\n| 1 | 2 |\n\nDespués.';

    expect(pad(text, text.indexOf('bb'))).toBe('Antes.\n\n| a | bb |\n|---|----|\n| 1 | 2  |\n\nDespués.');
  });
});
