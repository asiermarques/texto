import { parser as baseParser, GFM, Subscript, Superscript, Emoji } from '@lezer/markdown';
import { footnoteExtension } from './footnotes';

/**
 * The one parser every domain traversal (`computeLivePreviewInstructions`,
 * `computeDimmedRanges`, `countWordsInRange`) parses `text` with — GFM,
 * Subscript, Superscript and Emoji (US-001 of 008; the same extension set
 * `@codemirror/lang-markdown`'s `markdownLanguage.parser` applies
 * internally, ASM-003) plus the Footnote extension (US-012, BR-003's one
 * new dependency). Centralised so the extension is configured in exactly
 * one place rather than once per call site.
 *
 * Built from `@lezer/markdown`'s own base `parser` rather than from
 * `markdownLanguage.parser` (US-001, requirement 008): the latter drags
 * `@codemirror/language`, `@codemirror/view` and `@codemirror/state` — a
 * browser DOM editor layer — into every bundle that imports this module,
 * including `dist/extension.js`, whose only use for it is counting words.
 * This project now owns the extension list instead of inheriting it;
 * `test/unit/markdownParser.test.ts` is the guard (RISK-002) that the
 * resulting tree still matches `markdownLanguage.parser`'s, node types and
 * positions alike, over a fixture using every construct of the Composed
 * subset. The only thing lost is a `foldNodeProp` on `Table` — a
 * CodeMirror language-service property, not parse information, and nothing
 * in this project reads it.
 */
export const parser = baseParser.configure([GFM, Subscript, Superscript, Emoji, footnoteExtension]);
