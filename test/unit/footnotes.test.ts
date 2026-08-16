import type { SyntaxNodeRef } from '@lezer/common';
import { describe, expect, it } from 'vitest';
import { parser } from '../../src/domain/markdownParser';

function nodeNames(text: string): string[] {
  const names: string[] = [];
  parser.parse(text).iterate({ enter: (node: SyntaxNodeRef) => void names.push(node.type.name) });
  return names;
}

describe('footnoteExtension — US-012: the parser extension itself', () => {
  it('parses a footnote call as a FootnoteReference with two marks around the label', () => {
    const text = 'Texto con nota[^1] al pie.';
    const names = nodeNames(text);

    expect(names).toContain('FootnoteReference');
    expect(names).toContain('FootnoteReferenceMark');
  });

  it('parses a footnote definition as its own block, with the marker split from its (inline-parsed) content', () => {
    const text = '[^1]: Nota con **negrita**.';
    const names = nodeNames(text);

    expect(names).toContain('FootnoteDefinition');
    expect(names).toContain('FootnoteDefinitionMark');
    expect(names).toContain('StrongEmphasis'); // the definition's content is inline-parsed, not opaque text
  });

  it('does not claim an empty label — "[^]" falls back to being parsed as an ordinary (shortcut) Link', () => {
    const text = 'Sin nota [^] vacía.';
    const names = nodeNames(text);

    expect(names).not.toContain('FootnoteReference');
  });

  it('leaves ordinary Links and reference LinkReferences untouched (RISK-003)', () => {
    const text = 'Ver [este enlace][ref] ahora.\n\n[ref]: https://example.com';
    const names = nodeNames(text);

    expect(names).toContain('Link');
    expect(names).toContain('LinkReference');
    expect(names).not.toContain('FootnoteReference');
    expect(names).not.toContain('FootnoteDefinition');
  });
});
