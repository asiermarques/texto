import type { MarkdownExtension } from '@lezer/markdown';

/**
 * US-012: Footnotes are not part of CommonMark or GFM — `@lezer/markdown`
 * has no support for them (BR-003: this is the one new parser extension the
 * whole requirement needs). Two constructs, deliberately kept simple
 * (ASM-002 — prose with apparatus, not a second markdown dialect):
 *
 * - A call, `[^label]`, inline wherever prose can appear. Shaped exactly
 *   like `StrongEmphasis`/`Strikethrough` — a node with two mark children
 *   and the label as the gap between them — so it composes for free through
 *   `INLINE_MARK_NODES` in `src/domain/livePreview.ts`.
 * - A definition, `[^label]: text`, one physical line (PD-005's own
 *   grain: a footnote's text is a Paragraph in miniature). Multi-line/
 *   multi-paragraph footnote content is out of scope — a footnote that
 *   needs more than a line is an endnote, not what this requirement asks
 *   for.
 *
 * `FootnoteReference` is excluded from `Link`'s own territory by running
 * `before: 'Link'`: a `[` is only ever claimed here when it is immediately
 * followed by `^label]`, so an ordinary `[text](url)` or `[text][ref]`
 * never reaches this parser at all.
 */
export const footnoteExtension: MarkdownExtension = {
  defineNodes: ['FootnoteReference', 'FootnoteReferenceMark', 'FootnoteDefinition', 'FootnoteDefinitionMark'],
  parseInline: [
    {
      name: 'FootnoteReference',
      before: 'Link',
      parse(cx, next, pos) {
        if (next !== 91 /* '[' */ || cx.char(pos + 1) !== 94 /* '^' */) {
          return -1;
        }
        let end = pos + 2;
        while (end < cx.end && cx.char(end) !== 93 /* ']' */ && !isFootnoteLabelBreak(cx.char(end))) {
          end++;
        }
        if (end === pos + 2 || cx.char(end) !== 93) {
          return -1; // an empty label, or the line ended before a closing "]"
        }
        end++; // include the closing "]"
        return cx.addElement(
          cx.elt('FootnoteReference', pos, end, [
            cx.elt('FootnoteReferenceMark', pos, pos + 2),
            cx.elt('FootnoteReferenceMark', end - 1, end),
          ])
        );
      },
    },
  ],
  parseBlock: [
    {
      name: 'FootnoteDefinition',
      before: 'LinkReference',
      parse(cx, line) {
        const { text, pos } = line;
        if (text.charCodeAt(pos) !== 91 /* '[' */ || text.charCodeAt(pos + 1) !== 94 /* '^' */) {
          return false;
        }
        let labelEnd = pos + 2;
        while (labelEnd < text.length && text.charCodeAt(labelEnd) !== 93 && !isFootnoteLabelBreak(text.charCodeAt(labelEnd))) {
          labelEnd++;
        }
        if (labelEnd === pos + 2 || text.charCodeAt(labelEnd) !== 93 || text.charCodeAt(labelEnd + 1) !== 58 /* ':' */) {
          return false;
        }
        let contentStart = labelEnd + 2;
        if (text.charCodeAt(contentStart) === 32 /* a single leading space, like a Blockquote's own convention */) {
          contentStart++;
        }
        const from = cx.lineStart + pos;
        const markTo = cx.lineStart + contentStart;
        const inlineChildren = cx.parser.parseInline(text.slice(contentStart), markTo);
        cx.addElement(cx.elt('FootnoteDefinition', from, cx.lineStart + text.length, [cx.elt('FootnoteDefinitionMark', from, markTo), ...inlineChildren]));
        cx.nextLine();
        return true;
      },
    },
  ],
};

function isFootnoteLabelBreak(charCode: number): boolean {
  return charCode === 32 || charCode === 9 || charCode === 10; // space, tab, newline
}
