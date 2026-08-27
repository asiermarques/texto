# ARCHITECTURE

Constraints come from `docs/PRODUCT.md`: one Author, one environment (VSCode),
markdown as the invisible source of truth, git for draft history, no servers.
The extension itself is now distributed (PD-006, tag-based release pipeline
below) — "no servers" is about runtime architecture, not about publishing.

## Shape

A VSCode extension that registers its own editor for `.md` files.

```
VSCode extension
  ├─ CustomTextEditorProvider   registers the Writing editor for *.md
  ├─ webview                    the Writing surface (CodeMirror 6)
  └─ bridge                     keeps webview and TextDocument in sync

storage
  └─ .md files in a git repo    (git UI: the one VSCode already ships)
```

There are no other pieces: no backend, no database, no process of our own, no
installer.

## Decisions

- **AD-001 — A custom editor via `CustomTextEditorProvider`, not decorations.**
  Decorating the real code editor (`createTextEditorDecorationType`) cannot hide
  markdown syntax properly and cannot escape the gutter, line numbers and the
  user's global font. `window.registerCustomEditorProvider` replaces the editor
  for a file type declared under the `customEditors` contribution point and
  hands over a `WebviewPanel` whose HTML we fully control. The provider uses the
  `TextDocument` as its data model, so **undo, save and backup stay VSCode's
  job** and ours reduces to syncing changes both ways. This is the only path
  that satisfies PD-002.
- **AD-002 — CodeMirror 6 inside the webview, with live preview.** Markdown is
  the source and syntax is hidden except around the cursor, built on
  `Decoration.replace` plus `EditorView.atomicRanges` so hidden markers behave as
  units when moving and deleting. Most of the effort lives here, because this is
  the project.
- **AD-003 — `.md` files in a git repo, with no layer on top.** No database, no
  custom format, no index. Draft history (PD-003) is not built: it is VSCode's
  source control panel, its diffs and its history. The texts stay readable and
  versioned even if this extension disappears.
- **AD-004 — No sync of our own.** One Author, one device. If a second ever
  appears, `git push` and `git pull` cover it.
- **AD-005 — The writing environment is configuration, and it is versioned.**
  The extension cannot remove VSCode's chrome, but the **Writing space** carries
  its own `.vscode/settings.json` (chrome hidden, no minimap, no line numbers),
  so opening that folder puts VSCode in writing mode and the setup travels with
  the text.

## Conventions

- **Package manager: npm. Bundler: esbuild** (`esbuild.js`), two bundles because
  they run in different worlds:
  - `dist/extension.js` — extension host, Node, `vscode` external (resolved by
    VSCode at runtime).
  - `dist/webview.js` — webview, browser, self-contained (no Node access).
  - Webview assets (stylesheet, bundled font) are copied to `dist/media/` in the
    same build step.
- **Folders, layered by purity** rather than by slice (the project is a single
  vertical slice, the Writing editor):
  - `src/domain/` — pure logic, never importing `vscode` as a value (types only,
    erased at compile time): `EditOriginTracker` (the echo loop), the shape of
    the webview↔extension message protocol, the webview HTML template, the CSP
    nonce, live preview and focus mode analysis, word counting
    (`wordCount.ts`), and the settings-toolbar button shapes
    (`editorToolbar.ts`). Requirement 006 added the editing affordances as
    their own pure functions, each with its own vitest suite:
    `inlineFormatting.ts` (strong/emphasis wrap-unwrap), `linkEditing.ts`
    (the Link shortcut and paste-a-URL-over-a-selection),
    `listContinuation.ts` (Enter inside a list/Task/blockquote) and
    `taskToggle.ts` (the click-to-toggle edit) — `src/webview/main.ts` only
    wires each one's result to a real `view.dispatch`, the same split
    `livePreview.ts`/`livePreviewPlugin.ts` already established.
  - `src/infrastructure/` — the only place that calls the real `vscode` API:
    `WritingEditorProvider`, which registers the `CustomTextEditorProvider` and
    applies `WorkspaceEdit`s; `wordCountStatusBar.ts` and `editorToolbar.ts`,
    thin wrappers around `vscode.StatusBarItem` built from
    `domain/editorToolbar.ts`'s pure button specs.
  - `src/webview/` — the entry point running inside the webview: CodeMirror 6,
    the Writing surface, the theme.
  - `src/extension.ts` — activation; exposes a minimal API (`panelFor(uri)`)
    through the return value of `activate()`, which is how the integration suite
    reaches a live webview panel. There is no other way to observe a webview
    from outside.
- **Three levels of tests:**
  - **Unit (vitest)** for `src/domain/`: the only logic with a pure shape, and
    therefore the only code that deserves real unit tests.
  - **Integration (`@vscode/test-electron` + Mocha)** for everything else: they
    boot a real VSCode, load the actual extension and exercise the Writing editor
    end to end — open, type, save, undo, external changes, typography, theme.
    This is the project's e2e suite; there is no browser or backend of our own,
    only one host, VSCode.
  - **Performance (vitest, `test:performance`, requirement 007, extended by
    008)** — a deterministic **Operation count** check, distinct from the
    first two because its bundle-byte metrics are a property of the build
    (`dist/`) and not of `src/domain/`. `test/performance/performanceCheck.test.ts`
    measures full markdown parses and **Tree update**s per keystroke and per
    cursor move (wrapping the shared `parser`'s own `parse` method and
    counting calls, split by whether fragments travelled with them — no
    production instrumentation — against a real `EditorState` holding
    `src/webview/treeField.ts`'s incremental `StateField`), **Live preview**
    instructions and **Focus mode** dim ranges (already the pure analysers'
    return values), and the byte size of both built (and, since 008,
    minified) bundles, all against the same **Chapter** fixture
    `test/unit/livePreviewLatency.test.ts` uses
    (`test/fixtures/chapterFixture.ts`). Every metric is compared for exact
    equality against `test/performance/baseline.json`, committed to the
    repository: any movement, in either direction, fails the check naming the
    metric, the baseline value and the observed one, and passes again only
    once the baseline is updated in the same commit. Nothing here measures
    elapsed time, which is what lets it resolve a single added parse without
    ever flaking — `test/unit/livePreviewLatency.test.ts` keeps its separate
    role as the loose, wall-clock order-of-magnitude guard. `pretest:performance`
    runs `npm run build` first, so the byte metrics never measure a stale or
    missing `dist/`. Enforced twice: a versioned pre-commit hook
    (`.githooks/pre-commit`, enabled via `core.hooksPath`) before the commit
    exists, and a step in the shared quality gate as the backstop for a
    skipped or missing hook.
  - The webview cannot be introspected from the test host by any other means, so
    it answers a small test-only message channel (`src/domain/testProtocol.ts`)
    reporting its rendered state (text, gutter, focus, computed styles). It is
    not behind a build flag: it is always on, and costs a handful of lines.
  - **Known limit:** with the current `test/integration/runTest.ts`
    (`launchArgs: [workspacePath, ...]`, the documented `@vscode/test-electron`
    pattern) the host starts without a recognised workspace folder
    (`vscode.workspace.workspaceFolders` is `undefined`), so
    `ConfigurationTarget.Workspace` is rejected by VSCode ("no workspace is
    opened"). Tests that need settings use `ConfigurationTarget.Global`, which
    exercises the same resolution mechanism; only the persistence location
    differs from a real **Writing space**.
- **Tag-based release pipeline (GitHub Actions, `.github/workflows/`).**
  `gate.yml` is a reusable `workflow_call` (typecheck, unit tests, the
  performance check, integration tests under `xvfb-run`, `.vscode-test/`
  cached on the `@vscode/test-electron` version) called by both `ci.yml`
  (`push`/`pull_request` on `main`, status
  check only, no secrets) and `release.yml` (`push: tags: v*.*.*`). Two
  workflow files sharing one gate definition, not one file with conditional
  jobs, so "does this push/PR pass CI" and "did this tag release
  successfully" stay separate, independently readable signals. `release.yml`
  checks the tag against `package.json`'s `"version"` before the gate runs
  (fails fast, before spending CI minutes), then — gated on that passing —
  packages the extension exactly once (`vsce package`, uploaded as a workflow
  artifact), then runs two independent jobs, each `needs: [package]` and
  neither `needs:` the other, so one's failure never masks or blocks the
  other (RISK-002 in `.workflow/requisites/004-tag-based-marketplace-release.md`):
  it publishes that same `.vsix` to Open VSX, and it attaches it to a GitHub
  Release for the VS Code Marketplace. The Marketplace side is a manual
  upload, not a third publish job: `vsce`'s only non-interactive path left
  after Azure DevOps' March 2026 retirement of global PATs is either an
  org-scoped PAT to re-issue by hand per Azure DevOps org, or an unannounced,
  undocumented `--oidc` flag with no self-service trusted-publisher setup
  on the Marketplace yet (tracked upstream at `microsoft/vsmarketplace#1422`)
  — not worth automating over a manual upload at this project's size. The
  Open VSX job reads its token (`OVSX_PAT`) from its own GitHub Environment,
  never a bare repository secret. Neither the `ovsx publish` nor the
  `gh release create` step carries `--skip-duplicate`, `continue-on-error` or
  `|| true`: both already fail on a version/tag that already exists, so a
  re-pushed tag fails the run rather than silently no-op'ing.
- **Typography: Literata Variable**, bundled via `@fontsource-variable/literata`
  (SIL Open Font License) and served locally from `dist/media` — no network at
  runtime.
- **Interface language: VSCode's own display language, no localisation layer
  of our own (US-004, requirement 003).** One source of truth (BR-001): the
  Writing editor never reads a `texto.*` setting for this, and there is no
  language picker anywhere in the interface. English is the fallback (BR-002)
  — for any display language that is not Spanish, and for any string with no
  Spanish translation. Identifiers (setting keys, enum values, the
  `viewType`) are never translated (BR-003); only the text describing them
  changes. Two bundle kinds, because the mechanisms VSCode offers are
  genuinely different:
  - **Manifest strings** (`package.json`'s `contributes`: Settings UI
    descriptions, command titles, the Writing editor's `displayName`) are
    `%key%` placeholders resolved by VSCode itself, before the extension
    host starts — `package.nls.json` is the English fallback bundle,
    `package.nls.es.json` the Spanish one. Nothing in `src/` participates;
    this is a static VSCode mechanism, like `contributes.configuration`
    itself.
  - **Runtime strings** (the status bar toolbar, US-005; the Word count,
    US-006) are resolved at call time through `vscode.l10n.t`, since they
    depend on state the manifest cannot see (the current preference, the
    word count). See the "settings toolbar" and "Word count" bullets below
    for the seam that keeps this out of `src/domain/` (ASM-002).
  - **Verification (RISK-002):** the integration host launches with
    `--disable-extensions`, which would also disable a Spanish language
    pack, so there is no way to boot the test host in Spanish and assert its
    rendering end to end. The English half is asserted the normal way (the
    host's own, stable language); the Spanish half is asserted with unit
    tests over the bundle files themselves — a key-parity check
    (`test/unit/packageNls.test.ts`) so a string added in English without
    its Spanish counterpart fails the build rather than silently falling
    back to English at runtime.
- **Editor theme: three values, light by default (US-016, DEC-005, revising
  US-005/OQ-002).** The Writing editor no longer always follows VSCode's theme.
  `texto.theme` is `light` (default) | `dark` | `vscode` (renamed from
  `claro`/`oscuro` in US-002, requirement 003); the first two are a
  fixed palette of the Writing editor's own (paper, not pure white; ink, not
  pure black), and only `vscode` keeps the original US-005 behaviour —
  background, text colour, cursor and selection taken from the CSS variables
  VSCode injects into every webview (`--vscode-editor-background` and
  friends), live-updated when the Author switches VSCode's theme. Every rule
  in `styles.css` reads a `--editor-*` custom property (`--editor-background`,
  `--editor-foreground`, `--editor-cursor`, `--editor-selection`,
  `--editor-blockquote-rail`, `--editor-scene-break`, `--editor-dim-opacity`,
  `--editor-scrollbar-thumb`), never `--vscode-editor-*` directly, so the same
  rules serve all three — `:root` defines the `vscode`-following values,
  `:root[data-theme='light']` and `:root[data-theme='dark']` override them.
  **No colour flash on open:** `data-theme` is stamped on `<html>` inside the
  HTML string `WritingEditorProvider` builds (`src/domain/html.ts`), resolved
  from the preference *before* the webview's first paint, not sent later over
  `postMessage` — the same "no flash" guarantee US-005 had for the `vscode`
  value now covers all three (RISK-005). Modo foco's dimming opacity is
  calibrated per theme too: a flat `opacity: 0.35`, fine over VSCode's own
  background, reads as *gone* rather than dimmed over some dark themes — the
  bug report this whole feature answers.
- **Live preview: an analyser separate from `EditorState`, handed a tree it
  does not produce (requirement 008).** `src/domain/livePreview.ts` takes an
  already-parsed `Tree` and the text it came from, and returns pure
  instructions (`hide` / `mark` / `line` — the last two carrying an optional
  value no class can express in advance: a **Link**'s `title`, a **Cell**'s
  computed `width`); it does not call the parser itself
  (US-003) and is not installed as CodeMirror language support, so this stays
  independent of the editor's `EditorState`. Producing the tree — the one
  impure part — belongs to `src/webview/treeField.ts` (US-004): a
  `StateField<Tree>` updated incrementally per transaction
  (`TreeFragment.applyChanges` + `parser.parse(text, fragments)`, ADR 0001),
  reusing everything an edit didn't touch instead of re-parsing the whole
  **Chapter**. `src/webview/livePreviewPlugin.ts` and `focusModePlugin.ts`
  both read `state.field(treeField)` — one tree, two readers — and turn the
  instructions into real `Decoration`s and `EditorView.atomicRanges` on every
  document or selection change; a selection-only change costs no parse at
  all, since `treeField` leaves the tree untouched when `docChanged` is
  false. This split is what makes the analysis testable with vitest, without
  a DOM: a unit test builds a tree directly (`parser.parse(text)`) and hands
  it in, same as `src/webview/` does, just not incrementally.
  - **Reveal granularity differs by construct.** Emphasis (bold/italic) is
    revealed when the selection touches the *content* between markers, not the
    whole physical line: revealing by line would leave markers visible right
    after typing `**bold**`, and would de-atomise a marker just before a
    backspace is meant to delete it as a unit. Block markers (heading, quote,
    list, **Scene break**) are revealed by whole physical line, which is what
    PD-001 asks for literally and carries no such tension, being single-line
    constructs.
  - **Hiding the marker and applying the composition style are two separate
    decisions (US-013, DEC-003).** Every block construct emits a `line`
    instruction for its composition (heading size/weight, list indent,
    blockquote rail, **Scene break**'s reserved height) on *every* line it
    spans, cursor or not — only `hide` (and, for list bullets and the
    **Scene break**, a second `line` instruction carrying a marker-substitute
    class for the `•`/`⁂` glyph) depends on whether the selection touches that
    line. Collapsing the two into one condition, as the original
    implementation did, made the whole line recompose the instant the cursor
    entered it (a heading losing its size, a list item losing its indent, a
    **Scene break** jumping between `⁂` and `---`). The marker-substitute
    class is what stops the composed glyph and the real marker from showing
    at once once the marker is revealed.
- **Every composition is a decoration plus CSS — never a widget, with one
  named exception (requirement 006, held under pressure by 009, spent by
  010).** `Decoration.replace`/`Decoration.mark`/`Decoration.line` over the
  Author's own characters, styled by `styles.css`; nothing in the Composed
  subset is an inserted `WidgetType` (a rendered image, a real `<input
  type="checkbox">`) — except the **Diagram**, which is one and could never
  be anything else (see the Diagram bullet below and
  `docs/adr/0004-a-diagram-is-the-one-widget.md`). A **Table**'s grid is no
  longer an example of what this rules out: requirement 009 authorised a
  widget for it (BR-002) and it turned out not to be needed — see the Table
  bullet below and
  `docs/adr/0003-tables-compose-without-a-widget.md`. A Task's box (DEC-002) is the sharpest
  example of why: `[ ]`/`[x]` stay real DOM text, visually replaced by a CSS
  `::before` glyph rather than removed — which is what lets
  `domEventHandlers` hit-test the span at all for US-016's click-to-toggle. A
  widget would still have to round-trip through the same text in the end (a
  fake checkbox has to write real markdown back on click), for a worse
  editing surface: real text stays selectable, composable with other
  decorations, and exempt from the layout risk RISK-004/US-006 already
  fought hard to get right for hidden markers. `docs/UBIQUITOUS_LANGUAGE.md`
  calls the whole set the **Composed subset**.
- **A Table is laid out per Cell, because its Rows cannot be laid out together
  (requirement 009).** Every **Cell** of a column is given the same share of the
  measure in every **Row** — computed once per **Table** in
  `src/domain/livePreview.ts` from the widest **Cell** in each column, stamped
  on the **Cell**'s own `mark` decoration as a `width`, and rendered as an
  inline-block. The obvious shapes do not work, and both were built and
  measured before this one: `display: table-row` on the lines has Chromium
  build a *separate anonymous table per line*, so every **Row** sizes its
  columns to its own content; `display: grid` on the line assigns tracks by
  child order, and a **Cell** is not reliably a child of its line (CodeMirror
  renders a `cm-widgetBuffer` around every hidden range, and **Focus mode**
  wraps a dimmed line's content in a span of its own). Shares of the measure
  rather than character widths because a **Cell** is set in the **Chapter**'s
  proportional type, where a character count is a good ratio and a bad width —
  and because a share cannot overflow the measure, which is how a wide
  **Table** comes to wrap instead of bleeding (OQ-001 of 009). The pipes and
  the padding around them are hidden as the *gaps between* **Cells** rather
  than as the pipe nodes themselves, which is what takes the Author's padding
  spaces with them. The **Delimiter row** is both hidden (its text leaves the
  DOM) and given a `display: none` line class (its empty line box goes too).
  A **Table** reveals whole, not by line like every other block construct:
  a **Row**'s raw markdown is only readable next to the other **Rows**'.
  Rationale and the discarded options: `docs/adr/0003-tables-compose-without-a-widget.md`.
- **A Diagram is the one widget, and it is loaded separately (requirement
  010).** A **Code block** fenced ```` ```mermaid ```` composes as the picture
  its **Diagram source** describes. Unlike a **Table**'s grid, this cannot be
  CSS over the Author's characters: the shape is *computed from* the source,
  not written in it, so there is nothing on screen for a decoration to style
  into a diagram. `LivePreviewInstruction` therefore gains a `diagram` kind
  and `src/webview/diagramWidget.ts` a `WidgetType` — the exception the
  bullet above names, and the whole of it.
  Two consequences the rest of the design falls out of. First, a decoration
  that replaces a line break may only come from a `StateField`, never from a
  `ViewPlugin`, so `src/webview/livePreviewPlugin.ts` is now a field holding
  the instruction list plus a plugin reading it — one traversal, two
  providers, the same shape ADR 0001 gave the parse. Second, the renderer
  (`beautiful-mermaid` plus the ELK layout solver, ~1.5MB minified against
  the Writing surface's own ~330KB, 94% of it a static import no bundler can
  shake out) is a **third esbuild bundle**, `dist/mermaid.js`, advertised to
  the webview in a `<meta>` tag and fetched by
  `src/webview/mermaidRenderer.ts` only once a **Chapter** turns out to
  contain a **Diagram**. `mermaidBundleBytes` is its own **Operation count**
  metric precisely so the two numbers can move independently: a rise in
  `webviewBundleBytes` matching it would mean a **Chapter** with no
  **Diagram** had started paying for one.
  Two details that are invisible until they are wrong: the SVG carries its
  whole palette in an inline `<style>`, which the webview's Content Security
  Policy refuses without the nonce (the diagram then draws as unstyled
  shapes, and every assertion that merely counted elements still passes —
  hence `styleHasNonce` in the test protocol); and the SVG opens with a
  Google Fonts `@import` that is stripped before insertion, so no **Chapter**
  reaches for the network by being opened. A **Diagram** carries its palette
  baked in rather than reading CSS, so it is the one composition that has to
  be rebuilt on a theme change — the `redrawDiagrams` effect. It is
  deliberately *not* in `atomicRanges`: every other replacement there exists
  to keep the cursor out, and a **Diagram** must let it in, because walking
  into it is how the source is revealed to edit.
  Rationale, and why the cost was accepted: `docs/adr/0004-a-diagram-is-the-one-widget.md`.
- **One parser configuration, shared by every traversal (requirement
  006, reconfigured by requirement 008).** `src/domain/markdownParser.ts`
  exports the single `MarkdownParser` instance that `livePreview.ts`,
  `focusMode.ts` and `wordCount.ts` all parse (or are handed a tree parsed)
  with. Built from `@lezer/markdown`'s own base `parser`, `.configure`d with
  `[GFM, Subscript, Superscript, Emoji, footnoteExtension]` — the same
  extension set `@codemirror/lang-markdown`'s `markdownLanguage.parser`
  applies internally, verified node-for-node by
  `test/unit/markdownParser.test.ts` (US-001, RISK-002) — rather than built
  *from* `markdownLanguage.parser`, which would drag `@codemirror/language`,
  `@codemirror/view` and `@codemirror/state` into `dist/extension.js` for a
  bundle whose only use for them was counting words. This project now owns
  the extension list instead of inheriting it from that package.
  `footnotes.ts` is BR-003's one new dependency (`@lezer/markdown`, already
  transitive through `@codemirror/lang-markdown`, now a direct one): a
  hand-written `parseInline`/`parseBlock` extension, not a second markdown
  implementation (ASM-003) — `[^label]` reuses the exact "two marks bounding
  content" shape `StrongEmphasis` already has, so it composes through the
  same `INLINE_MARK_NODES` table with no new code in `livePreview.ts`'s
  traversal; `[^label]: text` is deliberately single-line only (no
  multi-paragraph footnote content), matching PD-005's "one Paragraph, one
  line" grain instead of fighting it. RISK-001's mitigation — one parse
  shared *between the two view plugins*, not just one parser instance shared
  across call sites — was measured at three chapter lengths (US-017,
  `test/unit/livePreviewLatency.test.ts`) and found *not* to hold at the
  lengths an Author actually writes (11k, 28k words): requirement 008 takes
  it, owning an incrementally-updated tree in the webview instead of
  re-parsing per traversal — see "Live preview: an analyser separate from
  `EditorState`" below.
- **Preferences are VSCode settings, applied live (US-015).** Every Editor de
  escritura preference is declared under `contributes.configuration` in
  `package.json`, prefixed `texto.` (e.g. `texto.focusMode`, `texto.theme`,
  `texto.textSize`, `texto.alignment` — English identifiers since US-002,
  requirement 003), so it shows up in VSCode's own
  Settings UI and can be versioned in a **Writing space**'s
  `.vscode/settings.json` (AD-005). The shape and defaults are a pure type in
  `src/domain/preferences.ts` (`WritingEditorPreferences`, `readPreferences`);
  `src/infrastructure/preferences.ts` is the only place that reads or writes
  the real `vscode.workspace.getConfiguration('texto', resource)` — resolved
  per `resource` (a document's `vscode.Uri`) so a **Writing space**'s local
  settings win over the user's global ones, the way VSCode resolves any
  setting. `WritingEditorProvider` subscribes once, in `register()`, to
  `workspace.onDidChangeConfiguration` and reposts the affected panels'
  current preferences over the existing message protocol — one mechanism for
  every origin of a change: a command, the webview's own keymap (US-017), the
  settings menu (US-021), or the Author editing `settings.json` directly. No
  webview reload either way. Text size and alignment write at Global scope,
  the same as Focus mode — see that bullet below for why one preference
  being global doesn't stop a **Writing space** from overriding it locally on
  read.
- **Text size travels as a CSS custom property, not a class (US-017/US-018).**
  `--editor-font-size` is stamped on `<html>` in the initial HTML (same
  RISK-005 treatment as the theme) and live-updated from
  `src/webview/main.ts` (`applyTextSize`). `#editor-root`'s own `font-size`
  reads that property, and its `max-width` (the column's measure) is
  expressed in `em` against it, not in `rem` against the document root
  (F-004): growing the text grows the column in the same proportion, so the
  characters-per-line the measure was tuned for don't drift. The webview
  can't write `texto.textSize` itself (no access to
  `vscode.workspace.getConfiguration`) — its keymap (`Mod-=`/`Mod--`/`Mod-0`,
  plus `Mod-Alt-=`/`Mod-Alt--` in case the platform's zoom accelerator wins
  the first pair, RISK-006) posts a `changeTextSize` message and the
  extension does the write, exactly like the `texto.increaseTextSize` command.
- **Alignment reuses the theme's `[data-attribute]` pattern (US-019, DEC-006
  amended).** `texto.alignment` (renamed from `texto.alineacion` in US-002,
  requirement 003) sets `data-align` on `<html>` — `left` needs no rule (the
  default), `right` sets `text-align: right`, and `justified` turns on
  `hyphens: auto` alongside `text-align: justify`, the two as the same CSS
  rule on purpose: unhyphenated justification in Spanish opens rivers of
  white space between long words, so that value never offers one without the
  other. `right` was added after
  DEC-006 originally shipped with two values, on Author feedback about the
  settings toolbar (US-021) — see the implementation-plan note next to
  DEC-006. The **Scene break**'s mark keeps its own `text-align: center` for
  both non-default values, overriding the inherited value.
- **Word count is prose, not markdown (US-020, F-006).**
  `src/domain/wordCount.ts` walks the same `@codemirror/lang-markdown` parse
  tree `livePreview.ts` does, but the other way round: instead of deciding
  what to hide, it collects the spans structural marker nodes occupy
  (`HeaderMark`, `QuoteMark`, `ListMark`, `EmphasisMark`, `HorizontalRule`, …)
  and counts words in what's left after splicing those spans out — spliced,
  not replaced by a separator, because a mark can sit directly against real
  text with no space of its own (`*cursiva*.`) and inserting one would
  fabricate a word boundary that was never there. The total is computed
  host-side, straight from `document.getText()`, on every change; the
  selection count needs a message from the webview (`selectionWordCount`),
  because the selection only exists inside CodeMirror. `formatWordCountStatus`
  takes a `WordCountStrings` bag already resolved for the display language
  (US-006, requirement 003) instead of hard-coding the phrase, the same
  purity split as the toolbar; `src/infrastructure/wordCountStatusBar.ts`
  calls `vscode.l10n.t`. English does not inflect "selected" the way Spanish
  agrees it with *palabra* (seleccionada/seleccionadas), so the singular and
  plural selection suffix share one English source string — resolved as two
  different runtime-bundle entries via `l10n.t`'s `comment` option, which
  VSCode appends to the lookup key (`message + '/' + comment.join('')`)
  precisely to disambiguate cases like this one.
- **The status bar's visibility is governed by panel view state, not
  `onDidChangeActiveTextEditor` (US-020, RISK-007).** That event never fires
  for a `CustomTextEditor` — VSCode's own editor-focus tracking doesn't see
  one. `WritingEditorProvider` instead tracks one `activeUri` from every open
  panel's own `webviewPanel.onDidChangeViewState`, checking `active` at
  `resolveCustomTextEditor` time too (a freshly opened panel is usually
  already active, and view state only fires on a later *change*). Every
  other Prose-editor feature that needs "the current Chapter" from outside a
  webview's own message handler — the text size commands, the settings
  toolbar — reads through the same `activeUri`, not
  `vscode.window.activeTextEditor`.
- **Raw markdown view is Live preview's own Compartment, not a second one
  (US-022).** `src/webview/main.ts` wraps `livePreviewPlugin` in a
  `Compartment` the same way Focus mode already wrapped `focusModePlugin`;
  toggling "ver markdown" reconfigures both compartments together
  (`applyComposition`), turning Live preview off and forcing Focus mode's
  dimming off regardless of `texto.focusMode`, so the raw syntax is never
  half-dimmed. It is panel state, not a preference: a freshly opened panel
  is always composed, and the toggle (`texto.toggleRawMarkdown`) is routed
  only to the active panel (the same `activeUri` RISK-007 introduced) — there
  is nothing to persist, and nowhere it would be persisted to.
- **The settings toolbar is a view over the settings, never a second store
  (US-021).** Originally a QuickPick menu behind the word count item;
  redesigned on Author feedback into one `vscode.StatusBarItem` per setting
  value, next to the word count — a 3-way choice (Theme, Alignment) shows one
  button per value with `$(check)` marking the active one, a `+`/`-` pair
  plus the size itself for text size, and a single toggle button each for
  **Focus mode** and **Raw markdown**. `src/domain/editorToolbar.ts` builds
  every button's text and tooltip as pure functions of the current
  `WritingEditorPreferences`, the raw-view state, and a `ToolbarStrings` bag
  already resolved for the display language (US-005, requirement 003) — the
  module stays free of `vscode` as a value (ASM-002), so it cannot call
  `vscode.l10n.t` itself. `src/infrastructure/editorToolbar.ts`
  (`EditorToolbar`) is the only place that creates the real status bar items
  and the only one that calls `vscode.l10n.t`, resolving `ToolbarStrings`
  fresh on every `refresh()` (cheap, and simpler than caching something that
  cannot change without a window reload — EDGE-002) — shown and hidden
  alongside `WordCountStatusBar` under the same `activeUri` (RISK-007) and
  refreshed whenever `onPreferencesChanged` or a `rawMarkdownChanged` message
  fires for the active panel. Each button's `.command` is either one of the
  commands earlier stories already registered (`texto.increaseTextSize`,
  `texto.toggleFocusMode`, `texto.toggleRawMarkdown`, …) or a small new
  generic pair, `texto.setTheme`/`texto.setAlignment`, invoked with the
  button's own value as a `vscode.Command.arguments` entry and validated
  against `isEditorTheme`/`isTextAlignment` before writing — not declared in
  `contributes.commands` (an argument-only command has no palette audience).
- **The Running version is a toolbar button, not an About dialog.** The last
  button in the group (lowest priority, so rightmost) reads
  `$(info) Texto <version>` and answers "which Texto is this" without a
  click — the same Author preference for a visible control over a hidden
  menu that shaped the rest of the toolbar. The version is not a preference
  and has no store: `WritingEditorProvider.register()` reads it once from
  `context.extension.packageJSON.version` and hands it to
  `EditorToolbar.setVersion()`, because the toolbar is a static field
  constructed before any `ExtensionContext` exists. Clicking it runs
  `texto.showVersion`, which shows the same string as an information
  message; that command *is* declared in `contributes.commands` (unlike
  `texto.setTheme`/`texto.setAlignment` it takes no argument, so the palette
  is a real second entrance to it, reachable with no Chapter open).
- **Frontmatter is folded out of the Writing surface, and the toolbar
  button is the only way back.** It leads the button group, and it is the
  toolbar's only entry that can be absent — a Chapter with no block has no
  button. The fold shows *nothing* in its place: no placeholder, no marker,
  not even the blank line that separated the block from the prose (Author's
  choice), so the Chapter simply opens on its first paragraph. That is
  precisely why the button has to exist: with nothing drawn, there is
  nothing on the surface to click. It carries the same eye/eye-closed pair
  as Focus mode, being the same kind of thing — a toggle whose state is
  worth reading at a glance.
  `src/domain/frontmatter.ts` decides what counts as a block, for both
  fences an Author may write: `---` (YAML) and `+++` (TOML, what Hugo and
  its kin emit). The two are read with deliberately different strictness,
  because only one is ambiguous. `+++` means nothing else in markdown, so
  that path validates no line shapes at all — it finds the closing fence and
  counts keys, since rejecting exotic but legal TOML (multi-line arrays,
  `[table]` headers) would only cost the Author a real indicator. `---` is
  *also* how a **Scene break** is written, which is this module's whole
  reason for existing: there, real Frontmatter has to declare a field on the
  line right after the opening fence, while a Scene break is followed by a
  blank line and prose, and every later line has to stay YAML-shaped. Both
  fences require the block to close within `MAX_FRONTMATTER_LINES` and hold
  at least one field, so neither an unclosed fence nor two consecutive Scene
  breaks reads as metadata.
  Detection is line-based, and `WritingEditorProvider.frontmatterOf()` hands
  it only the Chapter's head — never `document.getText()`, which would copy
  a 30,000-word Chapter every time the toolbar settles. Because the
  button can vanish, `EditorToolbar.refresh()` now hides whichever items
  the domain did not produce, instead of only ever showing: a status bar
  item keeps its last text until told otherwise, which is also why
  `getButtonState()` reports a real `visible` rather than letting the
  integration suite infer absence from an empty `.text`. It settles on the
  Word count's existing debounce — the same burst of keystrokes, the same
  question about the text, so a second timer would buy nothing.
- **The fold is a decoration, never an edit (`src/webview/frontmatterFold.ts`).**
  One `Decoration.replace({block: true})` over the block's lines, paired
  with `EditorView.atomicRanges` exactly as `livePreviewPlugin.ts` pairs
  them for hidden markers: the cursor steps over the fold instead of into
  it, and a Backspace at the start of the first paragraph cannot eat an
  invisible line. `atomicRanges` cannot evict a cursor that was *already*
  inside when the fold appears, so `main.ts` moves the selection out before
  folding. The text on disk is never touched. Like Raw markdown, the fold
  lives in its own `Compartment`, is panel state that is never persisted (a
  Chapter always opens folded), and is toggled by a message to the active
  panel that the panel reports back (`frontmatterChanged`) so the button can
  label itself. Raw markdown outranks it: that view exists to show the
  Chapter exactly as it is on disk, so hiding something there would
  contradict the one thing it is for — the Author's own toggle is
  remembered, not lost, and applies again on the way back. Unfolding also
  scrolls the view to the top (`EditorView.scrollIntoView(0, {y: 'start'})`,
  dispatched after the compartment reconfigure so it measures against the
  layout that now has the block in it): the block always sits at the very
  top of the Chapter, so showing it to an Author reading page nine is the
  same as not showing it at all. The caret is deliberately left where they
  were writing — this carries the view, not the cursor.
  *Testing note*: `scrollDOM.scrollTop` read back through the test protocol
  reports 0 even while the view is demonstrably at the end of the Chapter —
  the measurement lands before the browser has applied the scroll — so an
  earlier attempt to expose it on `EditorSnapshot` was removed rather than
  left as a trap. What is actually drawn is the reliable signal: CodeMirror
  only builds the lines near the viewport, so `renderedText` says where the
  Author is looking. Note also that re-sending `scrollToEnd` on every poll
  livelocks the scroll (each dispatch reschedules CodeMirror's measure before
  the last one lands) — send it once, then poll.
- **Frontmatter is not prose, so the Word count skips it.** `countWords`
  starts at `proseStartOffset(text)` rather than at 0. This is a fix, not a
  refinement: lezer has no frontmatter extension, so it read `title: Caminos`
  as a Paragraph and the closing `---` as the setext heading underlining it,
  and every field counted as words the Author never wrote — a Chapter of
  three words reported eight. The webview clamps the *selection* count the
  same way, or Select all would report more words selected than the Chapter
  has in total.
  No new source of truth either way: every button writes through the exact
  same setter functions the earlier stories' commands and the webview keymap
  already use.
- **A preference is written to the scope it is read from, not always to
  Global.** Every `texto.*` setter used to update `ConfigurationTarget.Global`
  unconditionally, which is right for an Author who configures nothing else —
  and wrong for the **Writing space** the README tells them to build: VSCode
  resolves a folder's `.vscode/settings.json` *over* Global, so inside a Work
  that pins `texto.theme` or `texto.focusMode` the write landed in a scope the
  Chapter never read back and the toolbar button did nothing at all (Author
  report). `writePreference` (`src/infrastructure/preferences.ts`) now
  inspects the setting for the Chapter being edited and updates the most
  specific scope that already defines it — the pure decision is
  `resolveWriteScope` in `domain/preferences.ts` — falling back to Global,
  which keeps the original behaviour everywhere nothing is pinned. Two
  corollaries: the four settings are declared `"scope": "resource"` in
  `package.json` (a `window`-scoped setting cannot be written per folder at
  all, and VSCode rejects the update outright), and the toggles that compute
  their next value from the current one (`texto.toggleFocusMode`, the text
  size steps) read through the same resource, or they would toggle away from
  a value the Author is not looking at.
- **The toolbar hides on leaving the Chapter, not on losing focus.** A
  `WebviewPanel` goes `active: false` the moment anything outside the iframe
  takes focus — including the toolbar's own status bar buttons — so the
  original `else` branch of `onDidChangeViewState` hid the whole toolbar under
  the very click meant to use it, and left `activeUri` undefined for the
  command that click was about to run (`texto.toggleRawMarkdown` routes by
  it). Only `!visible` clears the active panel now; `lastActiveUri` keeps the
  Chapter a preference write belongs to even across that blur.
- **Opening the right editor from the context menu delegates to
  `vscode.openWith` (US-023/US-024).** `texto.openWithTexto` and
  `texto.openAsMarkdown` (contributed to `explorer/context` and
  `editor/title/context`, `when: resourceExtname == .md`) both resolve a
  resource — the menu's argument when present, otherwise whichever markdown
  file is in view in either editor kind — and hand it to
  `vscode.openWith(uri, viewType)`, `texto.editor` (renamed from
  `texto.editorDeEscritura` in US-003, requirement 003) or `'default'`
  respectively. `customEditors`' `priority` stays `"option"` (US-011): these
  commands are the shortcut for everything the default association doesn't
  cover, not a change to what it resolves to.
- **Focus mode: same pattern, unit = top-level block.**
  `src/domain/focusMode.ts` dims every top-level block (paragraph, heading,
  quote, list, **Scene break**) the selection does not touch;
  `src/webview/focusModePlugin.ts` applies it as a `Decoration.mark` with an
  opacity class — it never shifts text. The switch lives in a CodeMirror
  `Compartment`, so toggling reconfigures the view in place without recreating
  the `EditorState` or reloading the webview. The preference is the
  `texto.focusMode` setting (US-015) rather than `context.globalState`: no
  in-memory cache is needed, because `vscode.workspace.getConfiguration` is
  synchronous and always current within the extension host — the staleness
  that justified a cache with `globalState` (a read triggered from a
  different event could observe a value from before an in-flight write,
  because of that storage's own IPC round trip) does not apply here.

## Technical risks

1. **The webview ↔ `TextDocument` bridge.** Applying an edit changes the
   document, which fires a change event, which is forwarded to the webview,
   which emits again. Own changes must be told apart from external ones from day
   one (`EditOriginTracker`).
2. **Cursor feel.** CodeMirror 6 is excellent, but the bar is iA Writer. Validate
   by writing for real before anything else (RISK-002).
3. **Search inside the webview.** VSCode's own find does not reach webview
   content; CodeMirror's search extension is used instead, and it is a different
   search from the rest of the editor.
4. **Loading webview resources.** Fonts and assets go through
   `Webview.asWebviewUri` and the webview's content security policy. Known
   friction, not an obstacle — but the policy also reaches the styles
   CodeMirror injects at runtime (its base theme, every `EditorView.theme`),
   which it only stamps with the nonce when `EditorView.cspNonce` says what
   the nonce is. Dropping them fails silently: the editor still renders, it
   just loses its layout (`.cm-content` stops filling the Writing surface, so
   a click below the text reaches nothing). See `createExtensions` in
   `src/webview/main.ts`, and the specificity note at the top of
   `src/webview/styles.css` for the other half of the same seam.
5. **Git conflicts over prose.** They do not happen with one device. The
   mitigation is not to edit the same file in two places without pushing.

## Deferred

Work structure (scenes, chapters, reordering). AI review — if it arrives, with a
personal API key stored locally, since being the only user there is no need for
an intermediary server. Importing from Google Docs (see OQ-002 in PRODUCT.md).
