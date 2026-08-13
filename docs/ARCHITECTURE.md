# ARCHITECTURE

Constraints come from `docs/PRODUCT.md`: one Author, one environment (VSCode),
markdown as the invisible source of truth, git for draft history, no
distribution and no servers.

## Shape

A VSCode extension that registers its own editor for `.md` files.

```
VSCode extension
  ├─ CustomTextEditorProvider   registers the Prose editor for *.md
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
  vertical slice, the Prose editor):
  - `src/domain/` — pure logic, never importing `vscode` as a value (types only,
    erased at compile time): `EditOriginTracker` (the echo loop), the shape of
    the webview↔extension message protocol, the webview HTML template, the CSP
    nonce, live preview and focus mode analysis.
  - `src/infrastructure/` — the only place that calls the real `vscode` API:
    `ProseEditorProvider`, which registers the `CustomTextEditorProvider` and
    applies `WorkspaceEdit`s.
  - `src/webview/` — the entry point running inside the webview: CodeMirror 6,
    the Writing surface, the theme.
  - `src/extension.ts` — activation; exposes a minimal API (`panelFor(uri)`)
    through the return value of `activate()`, which is how the integration suite
    reaches a live webview panel. There is no other way to observe a webview
    from outside.
- **Two levels of tests:**
  - **Unit (vitest)** for `src/domain/`: the only logic with a pure shape, and
    therefore the only code that deserves real unit tests.
  - **Integration (`@vscode/test-electron` + Mocha)** for everything else: they
    boot a real VSCode, load the actual extension and exercise the Prose editor
    end to end — open, type, save, undo, external changes, typography, theme.
    This is the project's e2e suite; there is no browser or backend of our own,
    only one host, VSCode.
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
- **Typography: Literata Variable**, bundled via `@fontsource-variable/literata`
  (SIL Open Font License) and served locally from `dist/media` — no network at
  runtime.
- **Editor theme: three values, Claro by default (US-016, DEC-005, revising
  US-005/OQ-002).** The Prose editor no longer always follows VSCode's theme.
  `texto.tema` is `claro` (default) | `oscuro` | `vscode`; the first two are a
  fixed palette of the Prose editor's own (paper, not pure white; ink, not
  pure black), and only `vscode` keeps the original US-005 behaviour —
  background, text colour, cursor and selection taken from the CSS variables
  VSCode injects into every webview (`--vscode-editor-background` and
  friends), live-updated when the Author switches VSCode's theme. Every rule
  in `styles.css` reads a `--editor-*` custom property (`--editor-background`,
  `--editor-foreground`, `--editor-cursor`, `--editor-selection`,
  `--editor-blockquote-rail`, `--editor-scene-break`, `--editor-dim-opacity`,
  `--editor-scrollbar-thumb`), never `--vscode-editor-*` directly, so the same
  rules serve all three — `:root` defines the `vscode`-following values,
  `:root[data-theme='claro']` and `:root[data-theme='oscuro']` override them.
  **No colour flash on open:** `data-theme` is stamped on `<html>` inside the
  HTML string `ProseEditorProvider` builds (`src/domain/html.ts`), resolved
  from the preference *before* the webview's first paint, not sent later over
  `postMessage` — the same "no flash" guarantee US-005 had for the `vscode`
  value now covers all three (RISK-005). Modo foco's dimming opacity is
  calibrated per theme too: a flat `opacity: 0.35`, fine over VSCode's own
  background, reads as *gone* rather than dimmed over some dark themes — the
  bug report this whole feature answers.
- **Live preview: an analyser separate from `EditorState`.**
  `src/domain/livePreview.ts` parses the text with the `@codemirror/lang-markdown`
  parser independently of the editor's `EditorState` (it is not installed as
  language support) and returns pure instructions (`hide` / `mark` / `line`).
  `src/webview/livePreviewPlugin.ts` turns those into real `Decoration`s and
  `EditorView.atomicRanges` on every document or selection change. This split is
  what makes the behaviour testable with vitest, without a DOM.
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
- **Preferences are VSCode settings, applied live (US-015).** Every Editor de
  escritura preference is declared under `contributes.configuration` in
  `package.json`, prefixed `texto.` (e.g. `texto.modoFoco`), so it shows up in
  VSCode's own Settings UI and can be versioned in a **Writing space**'s
  `.vscode/settings.json` (AD-005). The shape and defaults are a pure type in
  `src/domain/preferences.ts` (`ProseEditorPreferences`, `readPreferences`);
  `src/infrastructure/preferences.ts` is the only place that reads or writes
  the real `vscode.workspace.getConfiguration('texto', resource)` — resolved
  per `resource` (a document's `vscode.Uri`) so a **Writing space**'s local
  settings win over the user's global ones, the way VSCode resolves any
  setting. `ProseEditorProvider` subscribes once, in `register()`, to
  `workspace.onDidChangeConfiguration` and reposts the affected panels'
  current preferences over the existing message protocol — one mechanism for
  both origins of a change, the toggle command and the Autor editing
  `settings.json` directly. No webview reload either way.
- **Focus mode: same pattern, unit = top-level block.**
  `src/domain/focusMode.ts` dims every top-level block (paragraph, heading,
  quote, list, **Scene break**) the selection does not touch;
  `src/webview/focusModePlugin.ts` applies it as a `Decoration.mark` with an
  opacity class — it never shifts text. The switch lives in a CodeMirror
  `Compartment`, so toggling reconfigures the view in place without recreating
  the `EditorState` or reloading the webview. The preference is the
  `texto.modoFoco` setting (US-015) rather than `context.globalState`: no
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
   friction, not an obstacle.
5. **Git conflicts over prose.** They do not happen with one device. The
   mitigation is not to edit the same file in two places without pushing.

## Deferred

Work structure (scenes, chapters, reordering). AI review — if it arrives, with a
personal API key stored locally, since being the only user there is no need for
an intermediary server. Importing from Google Docs (see OQ-002 in PRODUCT.md).
