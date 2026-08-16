import { markdownLanguage } from '@codemirror/lang-markdown';
import type { MarkdownParser } from '@lezer/markdown';
import { footnoteExtension } from './footnotes';

/**
 * The one parser every domain traversal (`computeLivePreviewInstructions`,
 * `computeDimmedRanges`, `countWordsInRange`) parses `text` with — GFM
 * (already `markdownLanguage`'s base, ASM-003) plus the Footnote extension
 * (US-012, BR-003's one new dependency). Centralised so the extension is
 * configured in exactly one place rather than once per call site.
 *
 * `markdownLanguage.parser` is typed as the generic (base) `Parser` by
 * `@codemirror/language` — `configure` is `MarkdownParser`'s own, so the
 * cast just recovers the type `@codemirror/lang-markdown` erased.
 */
export const parser = (markdownLanguage.parser as MarkdownParser).configure(footnoteExtension);
