---
title: Parse once and incrementally, and keep CodeMirror's view layer out of the extension host
status: Proposed
date: 2026-08-20
tags: [performance, live-preview, webview]
---

# 0001. Parse once and incrementally, and keep CodeMirror's view layer out of the extension host

## Context and problem statement

Every keystroke in the **Writing editor** currently costs **three full
markdown parses of the whole Chapter**:

- `src/webview/livePreviewPlugin.ts:33` — `computeLivePreviewInstructions(text, …)`
- `src/webview/focusModePlugin.ts:10` — `computeDimmedRanges(text, …)`
- `src/infrastructure/writingEditorProvider.ts:132` — `countWords(document.getText())`,
  on the extension host

Two of them (the webview's) also run on every `selectionSet`, so moving the
cursor with an arrow key re-parses the Chapter twice even though the document
has not changed.

This was known and deliberately deferred. `.workflow/requisites/006-markdown-for-non-fiction.md`
records it as RISK-001, and `test/unit/livePreviewLatency.test.ts` measured
it: at ~3,000 and ~6,000 words a keystroke stays "comfortably inside budget",
so the mitigation was left as "worth its own requirement rather than a rushed
slice, if a future measurement ever asks for it". ARCHITECTURE.md's "One
parser configuration, shared by every traversal" bullet repeats that
conclusion.

A measurement now asks for it. Extending the same fixture past the two sizes
the test covers (median of 15–20 runs, warm):

| Chapter | `parser.parse` | Live preview | Focus mode | Word count (host) |
|---|---|---|---|---|
| 2.2k words | 2.9ms | 3.0ms | 2.0ms | 2.2ms |
| 4.5k words | 3.6ms | 3.8ms | 3.6ms | 3.9ms |
| 11k words | 8.7ms | 9.6ms | 9.1ms | 9.5ms |
| 28k words | 36ms | 29ms | 25ms | 26ms |

The parse dominates: the traversals themselves cost under 1ms at every size.
At 11k words the **Writing surface** spends ~19ms of webview main thread per
keystroke — past the ~16ms a 60fps frame allows — and the extension host
spends a further ~9.5ms on the **Word count**, on the thread it shares with
git, language servers and every other extension in the window.

The cost is also structural, not only per-keystroke:

- **Decorations are built for the whole document**, never for
  `view.visibleRanges`: 13,351 `Decoration` objects allocated and sorted into
  a `RangeSet` per update on a 90KB Chapter, plus the parallel
  `EditorView.atomicRanges` set (`livePreviewPlugin.ts:64`).
- **`dist/extension.js` carries 291KB of `@codemirror/view` and 108KB of
  `@codemirror/state` into Node.** `src/domain/markdownParser.ts:1` imports
  `markdownLanguage` from `@codemirror/lang-markdown`, which drags
  `@codemirror/language` and, through it, the browser DOM editor layer into a
  bundle whose only use for it is counting words. Measured composition of the
  597KB host bundle: `@codemirror/view` 291KB, `@codemirror/state` 108KB,
  `@lezer/markdown` 67KB, `@lezer/common` 49KB, `src/` 32KB, the rest under
  25KB each.
- **Neither bundle is minified.** `esbuild.js` never sets `minify` and sets
  `sourcemap: true` unconditionally, so what ships is `dist/extension.js` at
  611KB and `dist/webview.js` at 720KB — parsed by V8 at activation and at
  every panel open respectively.

PD-002 ("a good UI is a precondition, not an extra"; the reference for feel is
iA Writer) is what makes this an architecture question rather than a
micro-optimisation: a **Writing surface** that drops frames while typing a
long Chapter fails the only product criterion that counts.

## Decision drivers

- **Performance (PD-002).** Keystroke and cursor latency must stay inside a
  frame at Chapter lengths the Author actually writes, not only at the two
  sizes already measured.
- **Performance, beyond this extension.** Work done on the extension host
  blocks every other extension in the window; the **Word count** is the only
  thing this extension puts there on a hot path, and it is the one that least
  needs to be immediate.
- **Maintainability.** AD-002's split — pure analysis in `src/domain/`, real
  `Decoration`s in `src/webview/` — is what makes Live preview testable with
  vitest and without a DOM. Any fix has to preserve it, not trade it away for
  speed.
- **Maintainability.** ARCHITECTURE.md's "one parser configuration, shared by
  every traversal" must survive: exactly one place configures the parser, or
  Live preview, Focus mode and the **Word count** can silently disagree about
  what the markdown means.
- **Cost.** The cheap half of the problem (minify, a debounce, an import) is
  reversible and needs no new mechanism; it should not be held hostage to the
  structural half.

## Considered options

1. **Keep measuring, change nothing.** Raise the budget in
   `test/unit/livePreviewLatency.test.ts` and revisit later.
2. **Share one parse between the two view plugins.** RISK-001's originally
   planned mitigation: one tree per update, both plugins read it. Removes one
   of three parses.
3. **Install `@codemirror/lang-markdown` as real language support and read
   `syntaxTree(state)`.** CodeMirror then maintains the tree incrementally,
   in chunks, with its own deadline.
4. **Own an incremental tree in a `StateField`, and pass it into the pure
   analysers** — plus the independent host-side and build fixes.

## Decision outcome

Chosen option: **"Own an incremental tree in a `StateField`, and pass it into
the pure analysers"**, together with the host-side and build fixes it does not
depend on.

**The tree becomes state, maintained incrementally.** A `StateField` in the
webview holds the current `Tree` and its `TreeFragment`s, updated on each
transaction with `TreeFragment.applyChanges` + `parser.parse(text, fragments)`.
Measured on a one-character insert at the middle of the same fixtures:

| Chapter | full parse | incremental | speedup |
|---|---|---|---|
| 1.8k words | 1.68ms | 0.09ms | 18x |
| 3.7k words | 2.88ms | 0.09ms | 33x |
| 9.2k words | 6.57ms | 0.15ms | 44x |
| 23k words | 16.28ms | 0.27ms | 61x |

The point is not the multiplier but the **shape**: the incremental cost is
near-constant in Chapter length. O(document) per keystroke becomes O(edit).

**The pure functions take the tree instead of parsing it.**
`computeLivePreviewInstructions`, `computeDimmedRanges` and
`countWordsInRange` gain a `Tree` parameter and stop calling `parser.parse`
themselves. This is what keeps AD-002 intact: the analysers stay pure and
DOM-free, unit tests pass `parser.parse(text)` exactly as they do today, and
the *ownership* of the tree — the only impure part — moves to the webview,
where CodeMirror already owns the document. It also removes the second parse
by construction (one tree, two readers) and makes a `selectionSet` update cost
nothing but the traversal, because an unchanged document leaves the field
untouched.

Option 3 gets the same incrementality for free and was rejected on two counts:
`syntaxTree(state)` may return a **partial** tree for a large document, which
would silently leave material below the viewport uncomposed while decorations
are still built whole-document; and it introduces a *second* parser
configuration (the `LanguageSupport`'s) alongside `src/domain/markdownParser.ts`,
against the "one parser configuration" convention, while also pulling in
behaviours the **Writing editor** does not want (HTML tag completion, the
language's own keymap). Option 2 halves the webview cost but leaves it O(n)
and does nothing for the extension host. Option 1 is not viable: the budget it
would raise is the one PD-002 sets.

**The extension host stops importing the editor.**
`src/domain/markdownParser.ts` builds its parser from `@lezer/markdown`
directly — `parser.configure([GFM, Subscript, Superscript, Emoji,
footnoteExtension])` — instead of from `markdownLanguage.parser`. This is
exactly what `@codemirror/lang-markdown` does internally; verified against the
current parser over a fixture using every construct of the **Composed
subset**, both produce **identical trees** (85 of 85 nodes, same types, same
positions). The only thing lost is a `foldNodeProp` on `Table`, which nothing
here reads. `@codemirror/language`, `@codemirror/view` and `@codemirror/state`
leave the host bundle: 597KB → ~180KB before minification.

**The Word count is debounced on the host.** The total is recomputed at most
once per ~200ms of typing rather than per keystroke. A status-bar number does
not need to be correct within a frame, and this is the only extension-host
work on the hot path.

**Both bundles are minified for release.** `esbuild.js` gains a production
mode (`minify: true`, `sourcemap` off) used by `npm run build`, with the
current unminified + sourcemapped output kept for `npm run watch`. Measured:
`dist/extension.js` 611KB → 289KB, `dist/webview.js` 720KB → 321KB.

### Consequences

- **Good:** keystroke latency in the webview stops growing with Chapter length
  — the dominant term becomes an incremental parse of near-constant cost.
- **Good:** a cursor move no longer re-parses anything; the tree is unchanged,
  so only the traversal runs.
- **Good:** the extension host is off the hot path while typing, and its
  bundle drops by roughly two thirds before minification — activation gets
  cheaper for every VSCode window, not just for a Chapter being edited.
- **Good:** AD-002's purity split survives untouched, and the analysers get
  *easier* to test, not harder: a test can now hand in a tree it built itself.
- **Trade-offs:** the webview gains genuine derived state (the tree and its
  fragments) that must stay in sync with the document. `TreeFragment` is the
  supported mechanism for exactly this, but it is one more invariant than
  "parse the string you were handed".
- **Trade-offs:** three domain signatures change, so their vitest suites —
  `livePreview.test.ts` (573 lines), `focusMode.test.ts`, `wordCount.test.ts`,
  `livePreviewLatency.test.ts` — all need a small shared helper. Mechanical,
  but it touches the largest test file in the project.
- **Trade-offs:** dropping `@codemirror/lang-markdown` from `src/domain/`
  means this project, not that package, now owns the list of markdown
  extensions the parser is configured with. A unit test asserting that the
  configured parser still produces the tree the **Composed subset** expects is
  the guard.
- **Trade-offs:** a minified release bundle makes a stack trace from a real
  installation harder to read. Acceptable while the reporting path is the
  Author's own issue tracker.
- **Follow-ups:**
  1. **Viewport-scoped decorations** — build for `view.visibleRanges` rather
     than the whole document (13,351 `Decoration` objects per update on a 90KB
     Chapter today). Second-order once the parse is incremental, and the
     riskier of the two: block constructs straddling a viewport edge need
     their enclosing block resolved, or a heading loses its size on scroll.
     Worth its own measurement before its own decision.
  2. **One shared `onDidChangeTextDocument` subscription** keyed by URI,
     instead of one per resolved panel (`writingEditorProvider.ts:271`): today
     N open Chapters means N handlers running for every change to any document
     in the window.
  3. **Re-baseline `test/unit/livePreviewLatency.test.ts`** — its 40ms budget
     was set for two full parses per keystroke and will no longer describe
     what runs. It should measure the incremental path, and at the Chapter
     lengths that actually hurt today (11k, 28k words), not only 3k and 6k.
  4. `retainContextWhenHidden: true` keeps a full CodeMirror instance alive per
     opened Chapter. Deliberate — it buys instant tab switching and no lost
     state — and recorded here as an accepted cost, not a pending change.

## Links

- `.workflow/requisites/006-markdown-for-non-fiction.md` — RISK-001, which
  deferred exactly this mitigation.
- `test/unit/livePreviewLatency.test.ts` — the measurement that deferred it,
  and the one to re-baseline.
- `docs/ARCHITECTURE.md` — AD-002; "One parser configuration, shared by every
  traversal"; "Live preview: an analyser separate from `EditorState`".
- `docs/PRODUCT.md` — PD-002, the driver.
