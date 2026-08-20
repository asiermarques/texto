import { markdownLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';
import type { SyntaxNodeRef } from '@lezer/common';
import { describe, expect, it } from 'vitest';
import { parser } from '../../src/domain/markdownParser';
import { footnoteExtension } from '../../src/domain/footnotes';
import { buildChapterFixture } from '../fixtures/chapterFixture';

// US-001 (008, RISK-002): this project now owns the markdown extension list
// instead of inheriting it from `@codemirror/lang-markdown`'s
// `markdownLanguage.parser` — the guard is that the two configurations
// still produce IDENTICAL trees (same node types at the same positions)
// over a fixture using every construct of the Composed subset, so a future
// edit to the extension list can't silently drift from what Live preview,
// Focus mode and the Word count expect.
const referenceParser = (markdownLanguage.parser as MarkdownParser).configure(footnoteExtension);

function nodeShape(text: string, p: MarkdownParser): Array<{ name: string; from: number; to: number }> {
  const shape: Array<{ name: string; from: number; to: number }> = [];
  p.parse(text).iterate({
    enter: (node: SyntaxNodeRef) => void shape.push({ name: node.type.name, from: node.from, to: node.to }),
  });
  return shape;
}

describe('markdownParser — US-001 (008): equivalent to markdownLanguage.parser', () => {
  it('produces an identical tree over a fixture using every construct of the Composed subset', () => {
    const text = buildChapterFixture(2);

    expect(nodeShape(text, parser)).toEqual(nodeShape(text, referenceParser));
  });

  it('produces an identical tree for an empty Chapter', () => {
    expect(nodeShape('', parser)).toEqual(nodeShape('', referenceParser));
  });
});
