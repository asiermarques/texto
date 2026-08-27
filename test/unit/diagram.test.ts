import { describe, expect, it } from 'vitest';
import { isDiagramInfo } from '../../src/domain/diagram';
import { computeLivePreviewInstructions } from '../helpers/domainTestHelpers';
import type { LivePreviewInstruction } from '../../src/domain/livePreview';

/** A collapsed cursor at `pos`. */
function cursorAt(pos: number) {
  return { from: pos, to: pos };
}

const FAR_AWAY = cursorAt(100000);

function diagrams(instructions: LivePreviewInstruction[]) {
  return instructions.filter((instruction) => instruction.kind === 'diagram');
}

const CHAPTER = ['Antes del diagrama.', '', '```mermaid', 'graph TD', '  A --> B', '```', '', 'Después del diagrama.'].join('\n');

describe('isDiagramInfo — which info string opts a Code block in', () => {
  it('accepts the bare language, whatever its case', () => {
    expect(isDiagramInfo('mermaid')).toBe(true);
    expect(isDiagramInfo('Mermaid')).toBe(true);
    expect(isDiagramInfo('MERMAID')).toBe(true);
  });

  it('accepts the language followed by anything else, the way every markdown tool reads an info string', () => {
    expect(isDiagramInfo('mermaid theme=neutral')).toBe(true);
    expect(isDiagramInfo('  mermaid  ')).toBe(true);
  });

  it('rejects a language that merely starts with it — a prefix match would compose code the Author meant to keep as code', () => {
    expect(isDiagramInfo('mermaidjs')).toBe(false);
    expect(isDiagramInfo('mermaid-cli')).toBe(false);
  });

  it('rejects every other language, and an absent one', () => {
    expect(isDiagramInfo('ts')).toBe(false);
    expect(isDiagramInfo('')).toBe(false);
  });
});

describe('computeLivePreviewInstructions — a Diagram', () => {
  it('composes a mermaid Code block as one diagram spanning the whole block, source and all', () => {
    const instructions = computeLivePreviewInstructions(CHAPTER, FAR_AWAY);

    expect(diagrams(instructions)).toEqual([
      {
        kind: 'diagram',
        from: CHAPTER.indexOf('```mermaid'),
        to: CHAPTER.indexOf('```\n\nDespués') + 3,
        source: 'graph TD\n  A --> B',
      },
    ]);
  });

  it('leaves the Code block composition off entirely — the picture replaces it, it does not sit under it', () => {
    const instructions = computeLivePreviewInstructions(CHAPTER, FAR_AWAY);

    expect(instructions.filter((instruction) => instruction.kind === 'line' && instruction.class === 'cm-live-codeblock')).toEqual([]);
    expect(instructions.filter((instruction) => instruction.kind === 'hide')).toEqual([]);
  });

  it('reveals the Diagram whole while the cursor is anywhere inside it, back to an ordinary Code block', () => {
    const insideSource = CHAPTER.indexOf('graph TD') + 4;
    const instructions = computeLivePreviewInstructions(CHAPTER, cursorAt(insideSource));

    expect(diagrams(instructions)).toEqual([]);
    expect(instructions).toContainEqual(expect.objectContaining({ kind: 'line', class: 'cm-live-codeblock' }));
  });

  it('counts the closing fence as inside — that is where the Author lands after typing the last line', () => {
    const closingFenceEnd = CHAPTER.indexOf('```\n\nDespués') + 3;
    const instructions = computeLivePreviewInstructions(CHAPTER, cursorAt(closingFenceEnd));

    expect(diagrams(instructions)).toEqual([]);
  });

  it('composes again as soon as the cursor leaves', () => {
    const afterTheBlock = CHAPTER.indexOf('Después');
    const instructions = computeLivePreviewInstructions(CHAPTER, cursorAt(afterTheBlock));

    expect(diagrams(instructions)).toHaveLength(1);
  });

  it('leaves a Code block in any other language exactly as it was', () => {
    const text = ['```ts', 'const a = 1;', '```'].join('\n');
    const instructions = computeLivePreviewInstructions(text, FAR_AWAY);

    expect(diagrams(instructions)).toEqual([]);
    expect(instructions).toContainEqual(expect.objectContaining({ kind: 'line', class: 'cm-live-codeblock' }));
  });

  it('leaves a fence with no info string alone', () => {
    const text = ['```', 'graph TD', '  A --> B', '```'].join('\n');

    expect(diagrams(computeLivePreviewInstructions(text, FAR_AWAY))).toEqual([]);
  });

  it('does not compose an empty fence — the Author has just opened it and is about to type into it', () => {
    const text = ['```mermaid', '```'].join('\n');

    expect(diagrams(computeLivePreviewInstructions(text, FAR_AWAY))).toEqual([]);
  });

  it('does not compose a fence holding only blank lines', () => {
    const text = ['```mermaid', '  ', '', '```'].join('\n');

    expect(diagrams(computeLivePreviewInstructions(text, FAR_AWAY))).toEqual([]);
  });

  it('composes a Diagram whose closing fence the Author has not typed yet', () => {
    const text = ['```mermaid', 'graph TD', '  A --> B'].join('\n');
    // The cursor has to be off the block for it to compose at all, and an
    // unclosed fence runs to the end of the Chapter — so there is nowhere
    // after it to put the cursor. Before it is the only place left.
    const instructions = computeLivePreviewInstructions(`Antes.\n\n${text}`, cursorAt(0));

    expect(diagrams(instructions)).toHaveLength(1);
  });

  it('leaves an indented fence inside a list item as a Code block — composing it would swallow the item marker', () => {
    const text = ['- Un punto:', '', '  ```mermaid', '  graph TD', '    A --> B', '  ```'].join('\n');

    expect(diagrams(computeLivePreviewInstructions(text, FAR_AWAY))).toEqual([]);
  });

  it('composes each of several Diagrams in the same Chapter independently', () => {
    const text = ['```mermaid', 'graph TD', '  A --> B', '```', '', 'Entre medias.', '', '```mermaid', 'sequenceDiagram', '  A->>B: hola', '```'].join('\n');
    const insideTheFirst = text.indexOf('graph TD') + 2;
    const instructions = computeLivePreviewInstructions(text, cursorAt(insideTheFirst));

    // The one the cursor is in is revealed; the other one is not.
    const composed = diagrams(instructions);
    expect(composed).toHaveLength(1);
    expect(composed[0]).toMatchObject({ source: 'sequenceDiagram\n  A->>B: hola' });
  });
});
