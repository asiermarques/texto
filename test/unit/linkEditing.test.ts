import { describe, expect, it } from 'vitest';
import { isLikelyUrl, pasteUrlOverSelection, wrapSelectionAsLink } from '../../src/domain/linkEditing';

describe('wrapSelectionAsLink — US-014: a Link from the keyboard', () => {
  it('wraps the selection as "[selection]()" with the cursor left where the target goes', () => {
    const text = 'Cita esta fuente ahora.';
    const from = text.indexOf('esta fuente');
    const to = from + 'esta fuente'.length;

    const result = wrapSelectionAsLink(text, { from, to });

    expect(result.changes).toEqual([{ from, to, insert: '[esta fuente]()' }]);
    const targetPos = from + '[esta fuente]('.length;
    expect(result.selection).toEqual({ anchor: targetPos, head: targetPos });
  });

  it('with a collapsed cursor, wraps an empty pair "[]()" with the cursor on the target', () => {
    const text = 'Cita aquí.';
    const pos = 5;

    const result = wrapSelectionAsLink(text, { from: pos, to: pos });

    expect(result.changes).toEqual([{ from: pos, to: pos, insert: '[]()' }]);
    expect(result.selection).toEqual({ anchor: pos + 3, head: pos + 3 });
  });
});

describe('isLikelyUrl — US-014: recognising a pasted URL', () => {
  it('recognises http(s) URLs', () => {
    expect(isLikelyUrl('https://example.com')).toBe(true);
    expect(isLikelyUrl('http://example.com/path?x=1')).toBe(true);
  });

  it('recognises a bare www. URL', () => {
    expect(isLikelyUrl('www.example.com')).toBe(true);
  });

  it('rejects plain text, even a single word', () => {
    expect(isLikelyUrl('hola')).toBe(false);
    expect(isLikelyUrl('Un párrafo con varias palabras.')).toBe(false);
  });

  it('rejects an empty or whitespace-only paste', () => {
    expect(isLikelyUrl('')).toBe(false);
    expect(isLikelyUrl('   ')).toBe(false);
  });
});

describe('pasteUrlOverSelection — US-014: pasting a URL over a selection', () => {
  it('turns the selection into a Link with the pasted URL as target', () => {
    const text = 'Cita esta fuente ahora.';
    const from = text.indexOf('esta fuente');
    const to = from + 'esta fuente'.length;

    const result = pasteUrlOverSelection(text, { from, to }, 'https://example.com');

    expect(result.changes).toEqual([{ from, to, insert: '[esta fuente](https://example.com)' }]);
  });

  it('EDGE-007: pasting over a selection that already is a Link replaces only its target, not its text', () => {
    const text = 'Ver [este enlace](https://old.example.com) ahora.';
    const linkTextFrom = text.indexOf('este enlace');
    const linkTextTo = linkTextFrom + 'este enlace'.length;

    const result = pasteUrlOverSelection(text, { from: linkTextFrom, to: linkTextTo }, 'https://new.example.com');

    const urlFrom = text.indexOf('https://old.example.com');
    const urlTo = urlFrom + 'https://old.example.com'.length;
    expect(result.changes).toEqual([{ from: urlFrom, to: urlTo, insert: 'https://new.example.com' }]);
  });
});
