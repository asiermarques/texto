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

  it('produces no instructions for a table (NOGOAL-001 of 006: tables stay outside the Composed subset)', () => {
    const text = '| a | b |\n| --- | --- |\n| 1 | 2 |';
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

describe('computeLivePreviewInstructions — US-002: strikethrough', () => {
  it('hides both ~~ markers of a Strikethrough and marks the inner text struck through', () => {
    const text = 'Un párrafo con ~~texto cortado~~ de verdad.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([
      { kind: 'hide', from: 15, to: 17 },
      { kind: 'hide', from: 30, to: 32 },
    ]);
    expect(instructions).toContainEqual({ kind: 'mark', from: 17, to: 30, class: 'cm-live-strikethrough' });
  });

  it('reveals the ~~ markers while the cursor is within the struck-through text', () => {
    const text = 'Un párrafo con ~~texto cortado~~ de verdad.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(20));

    expect(instructions).toEqual([]);
  });

  it('an empty strikethrough ("~~~~") produces no zero-length mark, for the same reason an empty Link/Image does not', () => {
    const text = 'Un párrafo ~~~~ raro.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.every((i) => i.kind !== 'mark' || i.from < i.to)).toBe(true);
  });
});

describe('computeLivePreviewInstructions — US-003: inline code', () => {
  it('hides both ` markers of an InlineCode and marks the inner text as code', () => {
    const text = 'Ejecuta `npm test` antes de terminar.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const hides = instructions.filter((i) => i.kind === 'hide');
    expect(hides).toEqual([
      { kind: 'hide', from: 8, to: 9 },
      { kind: 'hide', from: 17, to: 18 },
    ]);
    expect(instructions).toContainEqual({ kind: 'mark', from: 9, to: 17, class: 'cm-live-code' });
  });

  it('reveals the backticks while the cursor is within the code text', () => {
    const text = 'Ejecuta `npm test` antes de terminar.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(12));

    expect(instructions).toEqual([]);
  });
});

describe('computeLivePreviewInstructions — US-004: escapes', () => {
  it('hides the backslash of an escape, leaving the escaped character visible', () => {
    const text = 'Un \\* literal.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 3, to: 4 });
  });

  it('reveals the backslash while the cursor touches the escaped character', () => {
    const text = 'Un \\* literal.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(4)); // on the escaped "*"

    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([]);
  });
});

describe('computeLivePreviewInstructions — US-005: links', () => {
  it('composes an inline link as its text, hiding the brackets and the target', () => {
    const text = 'Ver [este enlace](https://example.com) ahora.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 4, to: 5 }); // "["
    expect(instructions).toContainEqual({ kind: 'hide', from: 16, to: 38 }); // "](https://example.com)"
    expect(instructions).toContainEqual({
      kind: 'mark',
      from: 5,
      to: 16,
      class: 'cm-live-link',
      title: 'https://example.com',
    });
  });

  it('reveals the raw syntax while the cursor touches the link text', () => {
    const text = 'Ver [este enlace](https://example.com) ahora.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(8)); // inside "este enlace"

    expect(instructions).toEqual([]);
  });

  it('stays revealed while the cursor is inside the target — typing the URL must not collapse the Link out from under it', () => {
    const text = 'Ver [este enlace](https://example.com) ahora.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(25)); // inside "https://example.com"

    expect(instructions).toEqual([]);
  });

  it('stays revealed with the cursor right after the closing ")", so the Author can review what was just typed', () => {
    const text = 'Ver [este enlace](https://example.com) ahora.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(38)); // right after ")"

    expect(instructions).toEqual([]);
  });

  it('collapses once the cursor moves past the Link — e.g. the space typed right after finishing it', () => {
    const text = 'Ver [este enlace](https://example.com) ahora.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(39)); // one past the closing ")"

    expect(instructions.filter((i) => i.kind === 'hide')).not.toEqual([]);
  });

  it('composes a reference link as its text, hiding the brackets and the label', () => {
    const text = 'Ver [este enlace][ref] ahora.\n\n[ref]: https://example.com';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const hides = instructions.filter((i) => i.kind === 'hide' && i.from < 23);
    expect(hides).toEqual([
      { kind: 'hide', from: 4, to: 5 },
      { kind: 'hide', from: 16, to: 22 },
    ]);
    expect(instructions).toContainEqual({ kind: 'mark', from: 5, to: 16, class: 'cm-live-link' });
  });

  it('composes an autolink as its URL text, hiding the angle brackets', () => {
    const text = 'Ver <https://example.com> ahora.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 4, to: 5 });
    expect(instructions).toContainEqual({ kind: 'hide', from: 24, to: 25 });
    expect(instructions).toContainEqual({
      kind: 'mark',
      from: 5,
      to: 24,
      class: 'cm-live-link',
      title: 'https://example.com',
    });
  });

  it('marks a bare URL without hiding anything, since its text and target are the same string', () => {
    const text = 'Ver https://example.com ahora.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([]);
    expect(instructions).toContainEqual({ kind: 'mark', from: 4, to: 23, class: 'cm-live-link', title: 'https://example.com' });
  });

  it('an empty link text ("[](url)", what Cmd+K leaves before the Author types anything) produces no zero-length mark', () => {
    const text = 'Ver [](https://example.com) ahora.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.every((i) => i.kind !== 'mark' || i.from < i.to)).toBe(true);
    expect(instructions).toEqual([]);
  });
});

describe('computeLivePreviewInstructions — US-006: images', () => {
  it('composes an image as its alternative text, marked distinctly from a Link', () => {
    const text = 'Ver ![una foto](https://example.com/foto.png) ahora.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 4, to: 6 }); // "!["
    expect(instructions).toContainEqual({
      kind: 'mark',
      from: 6,
      to: 14,
      class: 'cm-live-image',
      title: 'https://example.com/foto.png',
    });
  });

  it('stays revealed while the cursor is inside the target — same fix as a Link, US-005/006 share one branch', () => {
    const text = 'Ver ![una foto](https://example.com/foto.png) ahora.';
    const instructions = computeLivePreviewInstructions(text, cursorAt(30)); // inside the URL

    expect(instructions).toEqual([]);
  });

  it('collapses once the cursor moves past the Image', () => {
    const text = 'Ver ![una foto](https://example.com/foto.png) ahora.';
    const atClose = computeLivePreviewInstructions(text, cursorAt(45)); // right after ")"
    const pastClose = computeLivePreviewInstructions(text, cursorAt(46)); // one further

    expect(atClose).toEqual([]);
    expect(pastClose.filter((i) => i.kind === 'hide')).not.toEqual([]);
  });

  it('an empty alt text ("![](url)") produces no zero-length mark — Decoration.mark throws on those and would take down every decoration in the document', () => {
    const text = 'Ver ![](https://example.com/foto.png) ahora.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.every((i) => i.kind !== 'mark' || i.from < i.to)).toBe(true);
    // Left fully raw — nothing sensible to compose from an empty alt text.
    expect(instructions).toEqual([]);
  });
});

describe('computeLivePreviewInstructions — US-008: fenced code blocks', () => {
  const text = '```js\nconst a = 1;\nconsole.log(a);\n```';

  it('composes every line of the block, fence and info hidden, while the cursor is elsewhere', () => {
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const lines = instructions.filter((i) => i.kind === 'line' && i.class === 'cm-live-codeblock');
    // One instruction per line: "```js", "const a = 1;", "console.log(a);", "```".
    expect(lines).toHaveLength(4);
    expect(instructions).toContainEqual({ kind: 'hide', from: 0, to: 5 }); // "```js"
    expect(instructions).toContainEqual({ kind: 'hide', from: 35, to: 38 }); // closing "```"
  });

  it('reveals the opening fence while the cursor is on its line, but keeps every line composed', () => {
    const instructions = computeLivePreviewInstructions(text, cursorAt(2)); // on "```js"

    expect(instructions.filter((i) => i.kind === 'line' && i.class === 'cm-live-codeblock')).toHaveLength(4);
    expect(instructions).not.toContainEqual({ kind: 'hide', from: 0, to: 5 });
    expect(instructions).toContainEqual({ kind: 'hide', from: 35, to: 38 }); // the closing fence stays hidden
  });

  it('does not hide anything for an unclosed fence, but still composes every line to the end (EDGE-005)', () => {
    const unclosed = '```js\nconst a = 1;';
    const instructions = computeLivePreviewInstructions(unclosed, FAR_AWAY);

    expect(instructions.filter((i) => i.kind === 'line' && i.class === 'cm-live-codeblock')).toHaveLength(2);
    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([{ kind: 'hide', from: 0, to: 5 }]);
  });
});

describe('computeLivePreviewInstructions — US-008: indented code blocks', () => {
  it('composes every line of the block without hiding anything (no fence to hide)', () => {
    const text = '    indented code\n    second line';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([]);
    expect(instructions.filter((i) => i.kind === 'line' && i.class === 'cm-live-codeblock')).toHaveLength(2);
  });
});

describe('computeLivePreviewInstructions — US-009: tasks', () => {
  it('marks an unchecked Task box, regardless of the cursor', () => {
    const text = '- [ ] tarea sin hacer';
    const withCursorElsewhere = computeLivePreviewInstructions(text, FAR_AWAY);
    const withCursorOnIt = computeLivePreviewInstructions(text, cursorAt(3));

    for (const instructions of [withCursorElsewhere, withCursorOnIt]) {
      expect(instructions).toContainEqual({ kind: 'mark', from: 2, to: 5, class: 'cm-live-task cm-live-task-unchecked' });
    }
  });

  it('marks a checked Task box distinctly', () => {
    const text = '- [x] tarea hecha';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'mark', from: 2, to: 5, class: 'cm-live-task cm-live-task-checked' });
  });
});

describe('computeLivePreviewInstructions — US-010: nested lists indented by depth', () => {
  it('gives each nesting level its own depth class, starting at 1', () => {
    const text = '- uno\n  - anidado\n    - doble anidado\n- dos';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    const depthClasses = instructions.filter((i) => i.kind === 'line' && i.class.startsWith('cm-live-list-depth-'));
    expect(depthClasses).toContainEqual({ kind: 'line', from: 0, to: 1, class: 'cm-live-list-depth-1' }); // "uno"
    expect(depthClasses).toContainEqual({ kind: 'line', from: 8, to: 9, class: 'cm-live-list-depth-2' }); // "anidado"
    expect(depthClasses).toContainEqual({ kind: 'line', from: 22, to: 23, class: 'cm-live-list-depth-3' }); // "doble anidado"
    expect(depthClasses).toContainEqual({ kind: 'line', from: 38, to: 39, class: 'cm-live-list-depth-1' }); // "dos"
  });
});

describe('computeLivePreviewInstructions — US-011: setext headings', () => {
  it('composes a setext H1 with the same class as an ATX heading, hiding the "=" underline', () => {
    const text = 'Título\n======';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 7, to: 13 });
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 0, class: 'cm-live-heading-1' });
  });

  it('composes a setext H2 with the same class as an ATX heading, hiding the "-" underline', () => {
    const text = 'Subtítulo\n---------';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 10, to: 19 });
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 0, class: 'cm-live-heading-2' });
  });

  it('reveals the underline while the cursor is on its own line', () => {
    const text = 'Título\n======';
    const instructions = computeLivePreviewInstructions(text, cursorAt(9)); // on "======"

    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([]);
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 0, class: 'cm-live-heading-1' });
  });

  it('DEC-003: a "---" directly under a Paragraph (no blank line) composes as a setext H2, not a Scene break', () => {
    const text = 'Un párrafo\n---';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 0, class: 'cm-live-heading-2' });
    expect(instructions.some((i) => i.kind === 'line' && i.class === 'cm-live-scene-break')).toBe(false);
  });

  it('DEC-003: a "---" with a blank line above it still composes as a Scene break, unaffected', () => {
    const text = 'Un párrafo.\n\n---\n\nOtro párrafo.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'line', from: 13, to: 16, class: 'cm-live-scene-break' });
    expect(instructions.some((i) => i.kind === 'line' && i.class.startsWith('cm-live-heading'))).toBe(false);
  });
});

describe('computeLivePreviewInstructions — US-012: footnotes', () => {
  it('composes a footnote call as a superscript, hiding its marks', () => {
    const text = 'Texto con nota[^1] al pie.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 14, to: 16 }); // "[^"
    expect(instructions).toContainEqual({ kind: 'hide', from: 17, to: 18 }); // "]"
    expect(instructions).toContainEqual({ kind: 'mark', from: 16, to: 17, class: 'cm-live-footnote-ref' });
  });

  it('composes a footnote definition as a discreet block, keeping its label visible', () => {
    const text = '[^1]: La nota completa aquí.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 0, class: 'cm-live-apparatus' });
    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([]);
  });

  it("composes the definition's own text inline, same as a Paragraph would (bold, links, …)", () => {
    const text = '[^1]: Una nota con **negrita**.';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'mark', from: 21, to: 28, class: 'cm-live-strong' });
  });
});

describe('computeLivePreviewInstructions — US-012: reference definitions', () => {
  it('composes a Reference definition as a discreet block, without hiding the label or the URL', () => {
    const text = '[ref]: https://example.com';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 0, class: 'cm-live-apparatus' });
    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([]);
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
