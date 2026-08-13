import { describe, expect, it } from 'vitest';
import { computeDimmedRanges } from '../../src/domain/focusMode';

function cursorAt(pos: number) {
  return { from: pos, to: pos };
}

describe('computeDimmedRanges — US-009: dimming the text that does not hold the cursor', () => {
  const twoParagraphs = 'Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.';

  it('dims every top-level block except the one containing the cursor', () => {
    const dimmed = computeDimmedRanges(twoParagraphs, cursorAt(50)); // inside the second paragraph

    expect(dimmed).toEqual([{ from: 0, to: 35 }]);
  });

  it('moves the dimming when the cursor moves to the other paragraph', () => {
    const dimmed = computeDimmedRanges(twoParagraphs, cursorAt(10)); // inside the first paragraph

    expect(dimmed).toEqual([{ from: 37, to: 71 }]);
  });

  it('dims nothing when the document has a single block', () => {
    const dimmed = computeDimmedRanges('Un único párrafo.', cursorAt(5));

    expect(dimmed).toEqual([]);
  });

  it('dims nothing in either block when the selection spans both', () => {
    const dimmed = computeDimmedRanges(twoParagraphs, { from: 20, to: 50 });

    expect(dimmed).toEqual([]);
  });

  it('treats a heading as its own block, distinct from the paragraph below it', () => {
    const text = '## Título\n\nUn párrafo debajo.';
    const dimmed = computeDimmedRanges(text, cursorAt(3)); // inside the heading

    expect(dimmed).toEqual([{ from: 11, to: 29 }]);
  });
});
