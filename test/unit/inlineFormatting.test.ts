import { describe, expect, it } from 'vitest';
import { toggleInlineWrap } from '../../src/domain/inlineFormatting';

describe('toggleInlineWrap — US-013: strong/emphasis from the keyboard', () => {
  it('wraps a selection in the marker', () => {
    const text = 'Un párrafo con texto.';
    const from = text.indexOf('texto');
    const to = from + 'texto'.length;

    const result = toggleInlineWrap(text, { from, to }, '**');

    expect(result.changes).toEqual([
      { from, to: from, insert: '**' },
      { from: to, to, insert: '**' },
    ]);
    expect(result.selection).toEqual({ anchor: from + 2, head: to + 2 });
  });

  it('unwraps a selection already wrapped by the marker', () => {
    const text = 'Un párrafo con **texto**.';
    const from = text.indexOf('texto');
    const to = from + 'texto'.length;

    const result = toggleInlineWrap(text, { from, to }, '**');

    expect(result.changes).toEqual([
      { from: from - 2, to: from, insert: '' },
      { from: to, to: to + 2, insert: '' },
    ]);
    expect(result.selection).toEqual({ anchor: from - 2, head: to - 2 });
  });

  it('wraps emphasis with a single marker, distinct from strong', () => {
    const text = 'Un párrafo con texto.';
    const from = text.indexOf('texto');
    const to = from + 'texto'.length;

    const result = toggleInlineWrap(text, { from, to }, '*');

    expect(result.changes).toEqual([
      { from, to: from, insert: '*' },
      { from: to, to, insert: '*' },
    ]);
  });

  it('with a collapsed cursor (no selection), wraps an empty pair and leaves the cursor between the markers', () => {
    const text = 'Un párrafo.';
    const pos = 3;

    const result = toggleInlineWrap(text, { from: pos, to: pos }, '**');

    expect(result.changes).toEqual([{ from: pos, to: pos, insert: '****' }]);
    expect(result.selection).toEqual({ anchor: pos + 2, head: pos + 2 });
  });

  it('does not unwrap when only one side has the marker', () => {
    const text = '**texto sin cerrar.';
    const from = text.indexOf('texto');
    const to = from + 'texto'.length;

    const result = toggleInlineWrap(text, { from, to }, '**');

    expect(result.changes).toEqual([
      { from, to: from, insert: '**' },
      { from: to, to, insert: '**' },
    ]);
  });
});
