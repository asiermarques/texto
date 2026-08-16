import { describe, expect, it } from 'vitest';
import { computeEnterContinuation } from '../../src/domain/listContinuation';

describe('computeEnterContinuation — US-015: Enter continues the list, the Task and the quote', () => {
  it('continues a bullet list item, inserting the same marker on the new line', () => {
    const text = '- primero';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    expect(result).not.toBeNull();
    expect(result?.changes).toEqual([{ from: pos, to: pos, insert: '\n- ' }]);
    expect(result?.selection).toEqual({ anchor: pos + 3, head: pos + 3 });
  });

  it('continues an ordered list item, incrementing the number', () => {
    const text = '1. primero';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    expect(result?.changes).toEqual([{ from: pos, to: pos, insert: '\n2. ' }]);
  });

  it('continues a second ordered item to a third, not back to 2', () => {
    const text = '1. primero\n2. segundo';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    expect(result?.changes).toEqual([{ from: pos, to: pos, insert: '\n3. ' }]);
  });

  it('continues a Task list item with an empty, unchecked box — even from a checked item', () => {
    const text = '- [x] hecho';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    expect(result?.changes).toEqual([{ from: pos, to: pos, insert: '\n- [ ] ' }]);
  });

  it('continues a blockquote', () => {
    const text = '> una cita';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    expect(result?.changes).toEqual([{ from: pos, to: pos, insert: '\n> ' }]);
  });

  it('splits the item in place when Enter is pressed in the middle of its text, not just at the end', () => {
    const text = '- primero segundo';
    const pos = text.indexOf('segundo');

    const result = computeEnterContinuation(text, pos);

    expect(result?.changes).toEqual([{ from: pos, to: pos, insert: '\n- ' }]);
  });

  it('on an empty bullet item, removes the marker and leaves the block instead of continuing it', () => {
    const text = '- primero\n- ';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    const markerFrom = text.lastIndexOf('- ');
    expect(result?.changes).toEqual([{ from: markerFrom, to: text.length, insert: '' }]);
    expect(result?.selection).toEqual({ anchor: markerFrom, head: markerFrom });
  });

  it('on an empty Task item, removes the marker and leaves the block', () => {
    const text = '- [ ] ';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    expect(result?.changes).toEqual([{ from: 0, to: text.length, insert: '' }]);
  });

  it('on an empty blockquote line, removes the marker and leaves the block', () => {
    const text = '> ';
    const pos = text.length;

    const result = computeEnterContinuation(text, pos);

    expect(result?.changes).toEqual([{ from: 0, to: text.length, insert: '' }]);
  });

  it('returns null for an ordinary Paragraph — Enter behaves normally', () => {
    const text = 'Un párrafo cualquiera.';
    expect(computeEnterContinuation(text, text.length)).toBeNull();
  });
});
