import { describe, expect, it } from 'vitest';
import { computeLivePreviewInstructions } from '../../src/domain/livePreview';

/** A collapsed cursor at `pos`, nowhere near any construct in these fixtures. */
function cursorAt(pos: number) {
  return { from: pos, to: pos };
}

const FAR_AWAY = cursorAt(100000);

describe('computeLivePreviewInstructions — US-006: emphasis', () => {
  it('hides both ** markers of a StrongEmphasis and marks the inner text as strong', () => {
    const text = 'Un párrafo con **negrita** de verdad.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([
      { kind: 'hide', from: 15, to: 17 },
      { kind: 'hide', from: 24, to: 26 },
    ]);
    expect(instructions).toContainEqual({ kind: 'mark', from: 17, to: 24, class: 'cm-live-strong' });
  });

  it('hides both * markers of an Emphasis and marks the inner text as emphasis', () => {
    const text = 'Un *susurro* apenas audible.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([
      { kind: 'hide', from: 3, to: 4 },
      { kind: 'hide', from: 11, to: 12 },
    ]);
    expect(instructions).toContainEqual({ kind: 'mark', from: 4, to: 11, class: 'cm-live-emphasis' });
  });

  it('reveals the markers while the cursor is within the emphasized text', () => {
    const text = 'Un párrafo con **negrita** de verdad.';
    // Cursor in the middle of "negrita" (content range is [17, 24)).
    const instructions = computeLivePreviewInstructions(text, cursorAt(20));

    expect(instructions).toEqual([]);
  });

  it('hides the markers again as soon as the cursor moves past the closing marker', () => {
    const text = 'Un párrafo con **negrita** de verdad.';
    // Position 26 is right after the closing "**" — e.g. where the cursor
    // sits the instant typing of the closing marker finishes.
    const instructions = computeLivePreviewInstructions(text, cursorAt(26));

    expect(instructions.filter((i) => i.kind === 'hide')).toHaveLength(2);
  });

  it('does not reveal the markers merely because the cursor sits right before the opening marker', () => {
    const text = 'Un párrafo con **negrita** de verdad.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(15));

    expect(instructions.filter((i) => i.kind === 'hide')).toHaveLength(2);
  });

  it('produces no instructions for markdown outside the rendered subset (links, tables)', () => {
    const text = 'Un párrafo con [un enlace](https://example.com) dentro.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toEqual([]);
  });

  it('sorts instructions by position, so callers can build a RangeSet directly', () => {
    const text = '**a** y *b* y **c**.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);
    const froms = instructions.map((i) => i.from);

    expect(froms).toEqual([...froms].sort((a, b) => a - b));
  });

  it('only reveals the specific emphasis the cursor is inside, not every one on the line', () => {
    const text = '**a** y *b* y **c**.';
    // Cursor inside "b" (content range [9, 10)).
    const instructions = computeLivePreviewInstructions(text, cursorAt(9));

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([
      { kind: 'hide', from: 0, to: 2 },
      { kind: 'hide', from: 3, to: 5 },
      { kind: 'hide', from: 14, to: 16 },
      { kind: 'hide', from: 17, to: 19 },
    ]);
  });
});

describe('computeLivePreviewInstructions — US-007: headings', () => {
  it('hides the ATX marker and its following space, and applies a level-specific line class', () => {
    const text = '## Un título';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 0, to: 3 });
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 12, class: 'cm-live-heading-2' });
  });

  it('reveals the raw marker anywhere on the heading line, but keeps its composition class applied (US-013)', () => {
    const text = '## Un título';
    const instructions = computeLivePreviewInstructions(text, cursorAt(8));

    expect(instructions).toEqual([{ kind: 'line', from: 0, to: 12, class: 'cm-live-heading-2' }]);
  });
});

describe('computeLivePreviewInstructions — US-007: blockquote', () => {
  it('hides every quote marker of a multi-line blockquote, including ones nested in its paragraph', () => {
    const text = '> Una cita\n> con dos líneas.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([
      { kind: 'hide', from: 0, to: 2 },
      { kind: 'hide', from: 11, to: 13 },
    ]);
  });

  it('only reveals the quote marker on the active line, not the whole blockquote', () => {
    const text = '> Una cita\n> con dos líneas.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(5)); // inside "Una cita"

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([{ kind: 'hide', from: 11, to: 13 }]);
  });

  it('keeps the rail on both lines regardless of which one is active (US-013)', () => {
    const text = '> Una cita\n> con dos líneas.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(5)); // inside "Una cita"

    const lines = instructions.filter((i) => i.kind === 'line');
    expect(lines).toEqual([
      { kind: 'line', from: 0, to: 1, class: 'cm-live-blockquote' },
      { kind: 'line', from: 11, to: 12, class: 'cm-live-blockquote' },
    ]);
  });
});

describe('computeLivePreviewInstructions — US-007: lists', () => {
  it('hides the dash and its space for each item, applying both the composition and the marker-substitute classes', () => {
    const text = '- uno\n- dos';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([
      { kind: 'hide', from: 0, to: 2 },
      { kind: 'hide', from: 6, to: 8 },
    ]);
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 1, class: 'cm-live-list-bullet' });
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 1, class: 'cm-live-list-bullet-mark' });
  });

  it('keeps the number visible for an ordered list, but still applies a line class', () => {
    const text = '1. primero\n2. segundo';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([]);
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 2, class: 'cm-live-list-number' });
  });

  it('keeps the indentation of the item whose line contains the cursor, but not its bullet mark (US-013)', () => {
    const text = '- uno\n- dos';
    const instructions = computeLivePreviewInstructions(text, cursorAt(3)); // inside "uno"

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([{ kind: 'hide', from: 6, to: 8 }]);
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 1, class: 'cm-live-list-bullet' });
    expect(instructions).not.toContainEqual({ kind: 'line', from: 0, to: 1, class: 'cm-live-list-bullet-mark' });
    expect(instructions).toContainEqual({ kind: 'line', from: 6, to: 7, class: 'cm-live-list-bullet-mark' });
  });
});

describe('computeLivePreviewInstructions — US-008: scene break', () => {
  it('hides the horizontal rule and applies a scene-break line class', () => {
    const text = 'Primera escena.\n\n---\n\nSegunda escena.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 17, to: 20 });
    expect(instructions).toContainEqual({ kind: 'line', from: 17, to: 20, class: 'cm-live-scene-break' });
  });

  it('reveals the raw --- while the cursor is on its line, but keeps its composition class (US-013)', () => {
    const text = 'Primera escena.\n\n---\n\nSegunda escena.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(18));

    expect(instructions).toEqual([{ kind: 'line', from: 17, to: 20, class: 'cm-live-scene-break' }]);
  });

  it('only applies the marker-substitute class while the raw mark is hidden (US-013)', () => {
    const text = 'Primera escena.\n\n---\n\nSegunda escena.';

    const hidden = computeLivePreviewInstructions(text, FAR_AWAY);
    expect(hidden).toContainEqual({ kind: 'line', from: 17, to: 20, class: 'cm-live-scene-break-mark' });

    const active = computeLivePreviewInstructions(text, cursorAt(18));
    expect(active).not.toContainEqual({ kind: 'line', from: 17, to: 20, class: 'cm-live-scene-break-mark' });
  });

  it('does not touch the paragraphs on either side of the scene break', () => {
    const text = 'Primera escena.\n\n---\n\nSegunda escena.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.some((i) => i.from < 17 || i.to > 20)).toBe(false);
  });
});
