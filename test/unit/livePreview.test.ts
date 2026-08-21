import { describe, expect, it } from 'vitest';
import { computeLivePreviewInstructions } from '../helpers/domainTestHelpers';
import type { LivePreviewInstruction } from '../../src/domain/livePreview';

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

  it('composes a table (009 supersedes NOGOAL-001 of 006: a Table joined the Composed subset)', () => {
    const text = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions).not.toEqual([]);
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

  it('reveals the opening fence with the cursor at the end of its line — where a click on it lands', () => {
    // The whole fence line is hidden, so it renders empty and a real click
    // anywhere on it resolves to the line's end (measured: position 5 here),
    // never to a position "inside" the fence. Reading that as off the line
    // left the fence unreachable with the mouse.
    const instructions = computeLivePreviewInstructions(text, cursorAt(5));

    expect(instructions).not.toContainEqual({ kind: 'hide', from: 0, to: 5 });
    expect(instructions).toContainEqual({ kind: 'hide', from: 35, to: 38 }); // the closing fence stays hidden
  });

  it('keeps the opening fence hidden with the cursor on the next line', () => {
    const instructions = computeLivePreviewInstructions(text, cursorAt(6)); // first character of "const a = 1;"

    expect(instructions).toContainEqual({ kind: 'hide', from: 0, to: 5 });
  });

  it('reveals the closing fence with the cursor at the end of its line', () => {
    const instructions = computeLivePreviewInstructions(text, cursorAt(38)); // end of the closing "```"

    expect(instructions).not.toContainEqual({ kind: 'hide', from: 35, to: 38 });
    expect(instructions).toContainEqual({ kind: 'hide', from: 0, to: 5 }); // the opening fence stays hidden
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

/** Every composed Cell's mark instruction, narrowed so its attributes are readable. */
function cellMarks(instructions: readonly LivePreviewInstruction[]) {
  return instructions.flatMap((i) => (i.kind === 'mark' && i.class.startsWith('cm-live-table-cell') ? [i] : []));
}

describe('computeLivePreviewInstructions — US-001 of 009: the composed Table', () => {
  // "| Name | Role |\n| --- | --- |\n| Ana | Editor |"
  //  0      7      14 16          29 30      36     45
  const TABLE = '| Name | Role |\n| --- | --- |\n| Ana | Editor |';

  it('hides every pipe together with the padding around it, leaving only the Cells', () => {
    const instructions = computeLivePreviewInstructions(TABLE, FAR_AWAY);

    expect(instructions.filter((i) => i.kind === 'hide')).toEqual([
      { kind: 'hide', from: 0, to: 2 },
      { kind: 'hide', from: 6, to: 9 },
      { kind: 'hide', from: 13, to: 15 },
      { kind: 'hide', from: 16, to: 29 },
      { kind: 'hide', from: 30, to: 32 },
      { kind: 'hide', from: 35, to: 38 },
      { kind: 'hide', from: 44, to: 46 },
    ]);
  });

  it('marks each Cell so the stylesheet can lay the columns out', () => {
    const instructions = computeLivePreviewInstructions(TABLE, FAR_AWAY);

    expect(instructions.filter((i) => i.kind === 'mark')).toEqual([
      { kind: 'mark', from: 2, to: 6, class: 'cm-live-table-cell', attributes: { style: 'width: 45.04%; min-width: 3.73em; max-width: 3.73em' } },
      { kind: 'mark', from: 9, to: 13, class: 'cm-live-table-cell', attributes: { style: 'width: 54.95%; min-width: 4.55em; max-width: 4.55em' } },
      { kind: 'mark', from: 32, to: 35, class: 'cm-live-table-cell', attributes: { style: 'width: 45.04%; min-width: 3.73em; max-width: 3.73em' } },
      { kind: 'mark', from: 38, to: 44, class: 'cm-live-table-cell', attributes: { style: 'width: 54.95%; min-width: 4.55em; max-width: 4.55em' } },
    ]);
  });

  it('takes the Delimiter row out of the rendered text entirely, not just out of sight', () => {
    const instructions = computeLivePreviewInstructions(TABLE, FAR_AWAY);

    expect(instructions).toContainEqual({ kind: 'hide', from: 16, to: 29 });
  });

  it('gives the Header row and every Row their line class, and the Delimiter row its own', () => {
    const instructions = computeLivePreviewInstructions(TABLE, FAR_AWAY).filter((i) => i.kind === 'line');

    expect(instructions).toContainEqual(expect.objectContaining({ kind: 'line', from: 0, to: 0, class: 'cm-live-table-row' }));
    expect(instructions).toContainEqual({ kind: 'line', from: 0, to: 0, class: 'cm-live-table-header' });
    expect(instructions).toContainEqual({ kind: 'line', from: 16, to: 16, class: 'cm-live-table-delimiter' });
    expect(instructions).toContainEqual(expect.objectContaining({ kind: 'line', from: 30, to: 30, class: 'cm-live-table-row' }));
    expect(instructions.filter((i) => i.class === 'cm-live-table-header')).toHaveLength(1);
  });

  it('gives one column’s Cells the same width in every Row, in proportion to its widest Cell', () => {
    const cells = cellMarks(computeLivePreviewInstructions(TABLE, FAR_AWAY));

    // Column 0's widest Cell is "Name" (4, against "Ana"); column 1's is
    // "Editor" (6, against "Role") — 4 against 6 of the measure.
    expect(cells.map((c) => c.attributes?.style)).toEqual([
      'width: 45.04%; min-width: 3.73em; max-width: 3.73em',
      'width: 54.95%; min-width: 4.55em; max-width: 4.55em',
      'width: 45.04%; min-width: 3.73em; max-width: 3.73em',
      'width: 54.95%; min-width: 4.55em; max-width: 4.55em',
    ]);
  });

  it('counts a Cell’s characters, not its bytes, when sizing a column', () => {
    const text = '| á | bb |\n| --- | --- |\n| 1 | 2 |';
    const cells = cellMarks(computeLivePreviewInstructions(text, FAR_AWAY));

    // Both columns are below the floor a column never drops under, so their
    // *shares* come out even rather than 1 against 2 — while the cap that
    // stops a column growing past its content keeps counting the real
    // characters, "á" as one of them.
    expect(cells.map((c) => c.attributes?.style)).toEqual([
      'width: 42.88%; min-width: 1.87em; max-width: 1.87em',
      'width: 57.11%; min-width: 2.49em; max-width: 2.49em',
      'width: 42.88%; min-width: 1.87em; max-width: 1.87em',
      'width: 57.11%; min-width: 2.49em; max-width: 2.49em',
    ]);
  });

  it('stops a column growing wider than its own content, so a short Table does not stretch across the measure', () => {
    const text = '| Escena | Estado |\n| --- | --- |\n| El regreso | revisada |';
    const cells = cellMarks(computeLivePreviewInstructions(text, FAR_AWAY));

    // "El regreso" (10) and "revisada" (8) are the widest in their columns.
    expect(cells[0].attributes?.style).toBe('width: 54.43%; min-width: 5.1em; max-width: 6.75em');
    expect(cells[1].attributes?.style).toBe('width: 45.56%; min-width: 5.65em; max-width: 5.65em');
  });

  it('never lets a column be narrower than its own title, however wide the Table gets', () => {
    // Four long titles cannot share one measure without something giving.
    // What gives is the measure, never the title: each column keeps a floor
    // of its own Header row Cell, so "Personaje" is never broken into
    // "Per/son/aje". The Table bleeds into the margins, and scrolls if it
    // has to.
    const text = [
      '| Personaje | Papel en la novela | Notas del editor | Estado |',
      '| --- | --- | --- | --- |',
      '| Beltrán | Traductor literario de una obra extensa | Revisó el capítulo entero | Pendiente |',
    ].join('\n');
    const cells = cellMarks(computeLivePreviewInstructions(text, FAR_AWAY));

    expect(cells[0].attributes?.style).toContain('min-width: 6.83em');
    expect(cells[1].attributes?.style).toContain('min-width: 12.41em');
    expect(cells[2].attributes?.style).toContain('min-width: 11.17em');
    // "Estado" is a short title, but "Pendiente" under it is a longer word,
    // and it is the word that sets this column's floor.
    expect(cells[3].attributes?.style).toContain('min-width: 6.2em');
    // Every Row's Cells carry the same floor as the title above them.
    expect(cells[4].attributes?.style).toContain('min-width: 6.83em');
  });

  it('never lets a narrow column collapse beside a wide one', () => {
    const text = '| # | Descripción |\n| --- | --- |\n| 1 | Una línea larga de prosa corriente |';
    const cells = cellMarks(computeLivePreviewInstructions(text, FAR_AWAY));
    const [narrow] = cells.map((c) => Number.parseFloat(c.attributes?.style?.replace(/[^0-9.]/g, '') ?? '0'));

    // "#" is one character against a column of 34: proportion alone would
    // leave it 3% of the measure, less than a character wide.
    expect(narrow).toBeGreaterThan(5);
  });

  it('gives every Row one definite width, which is what the Cells’ shares are shares of', () => {
    const rows = computeLivePreviewInstructions(TABLE, FAR_AWAY).flatMap((i) =>
      i.kind === 'line' && i.class === 'cm-live-table-row' ? [i.attributes?.style] : []
    );

    // As wide as the content wants, never wider than the measure — and
    // never narrower than the titles and words inside need, in which case
    // the Table reaches into the margins instead of breaking them.
    expect(rows).toEqual(['width: clamp(8.28em, 8.28em, 100%)', 'width: clamp(8.28em, 8.28em, 100%)']);
  });

  it('widens a Row past the measure only when its own floors demand it', () => {
    const wide = [
      '| Personaje | Papel en la novela | Notas del editor | Estado |',
      '| --- | --- | --- | --- |',
      '| Beltrán | Traductor literario de una obra extensa | Revisó el capítulo entero | Pendiente |',
    ].join('\n');
    const [row] = computeLivePreviewInstructions(wide, FAR_AWAY).flatMap((i) =>
      i.kind === 'line' && i.class === 'cm-live-table-row' ? [i.attributes?.style] : []
    );

    // 36.61em of floors against a 38em measure: this one still fits, and
    // wants 50.73em if the page would give it.
    expect(row).toBe('width: clamp(36.61em, 50.73em, 100%)');
  });

  it('marks the last Row, which is where the Table closes', () => {
    const instructions = computeLivePreviewInstructions(TABLE, FAR_AWAY);
    const closing = instructions.filter((i) => i.kind === 'line' && i.class === 'cm-live-table-last-row');

    // TABLE's only body Row is also its last.
    expect(closing).toEqual([{ kind: 'line', from: 30, to: 30, class: 'cm-live-table-last-row' }]);
  });

  it('closes on the last Row and no earlier one', () => {
    const text = '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |';
    const closing = computeLivePreviewInstructions(text, FAR_AWAY).filter(
      (i) => i.kind === 'line' && i.class === 'cm-live-table-last-row'
    );

    expect(closing).toHaveLength(1);
    expect(closing[0].from).toBe(text.lastIndexOf('| 5 | 6 |'));
  });

  it('closes on the Header row when the Table has no body yet', () => {
    const text = '| a | b |\n| --- | --- |';
    const closing = computeLivePreviewInstructions(text, FAR_AWAY).filter(
      (i) => i.kind === 'line' && i.class === 'cm-live-table-last-row'
    );

    expect(closing).toEqual([{ kind: 'line', from: 0, to: 0, class: 'cm-live-table-last-row' }]);
  });

  it('reveals the WHOLE Table — every Row, not just the cursor’s — while the selection is inside it', () => {
    // Cursor inside "Ana", on the last line: the Header row two lines up
    // has to come back too (FR-003).
    expect(computeLivePreviewInstructions(TABLE, cursorAt(33))).toEqual([]);
    // …and from the Header row, and from the Delimiter row.
    expect(computeLivePreviewInstructions(TABLE, cursorAt(3))).toEqual([]);
    expect(computeLivePreviewInstructions(TABLE, cursorAt(20))).toEqual([]);
  });

  it('composes the Table again as soon as the selection leaves it', () => {
    const text = `${TABLE}\n\nAfter the table.`;
    const cursorAfter = cursorAt(text.length - 1);

    expect(computeLivePreviewInstructions(text, cursorAfter).length).toBeGreaterThan(0);
  });

  it('leaves a half-written Table exactly as typed (BR-004: it is not a Table until it parses as one)', () => {
    const text = '| a | b\n| 1 | 2 |';

    expect(computeLivePreviewInstructions(text, FAR_AWAY)).toEqual([]);
  });

  it('composes a Row that carries fewer Cells than the Header row', () => {
    const text = '| a | b |\n| --- | --- |\n| 1 |';
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(instructions.filter((i) => i.kind === 'mark')).toHaveLength(3);
    expect(instructions.filter((i) => i.kind === 'line' && i.class === 'cm-live-table-row')).toHaveLength(2);
  });
});

/** The class of every composed Cell, in document order. */
function cellClasses(text: string): string[] {
  return computeLivePreviewInstructions(text, FAR_AWAY).flatMap((i) => (i.kind === 'mark' ? [i.class] : []));
}

describe('computeLivePreviewInstructions — US-002 of 009: Column alignment', () => {
  // "| Name | Total |\n|:---|---:|\n| Ana | 12 |"
  //  0             15 17        27 29         40
  const ALIGNED = '| Name | Total |\n|:---|---:|\n| Ana | 12 |';

  it('gives each Cell the class of its own column, Header row included', () => {
    const marks = cellClasses(ALIGNED);

    expect(marks).toEqual([
      'cm-live-table-cell',
      'cm-live-table-cell cm-live-table-cell-right',
      'cm-live-table-cell',
      'cm-live-table-cell cm-live-table-cell-right',
    ]);
  });

  it('reads a centred column from its ":-:" marker', () => {
    const text = '| a | b |\n| :-: | --- |\n| 1 | 2 |';
    const marks = cellClasses(text);

    expect(marks[0]).toBe('cm-live-table-cell cm-live-table-cell-center');
    expect(marks[1]).toBe('cm-live-table-cell');
  });

  it('leaves an unmarked column with no alignment class of its own', () => {
    const text = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    expect(cellClasses(text).every((c) => c === 'cm-live-table-cell')).toBe(true);
  });
});
