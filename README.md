# Texto

A minimalist writing editor for markdown, inside VSCode. Hidden markdown
syntax, readable typography, no distractions; the texts stay as `.md` files
in a git repository.

See `docs/PRODUCT.md` for the why and `docs/ARCHITECTURE.md` for the how.

---

## Guide for the Author

This part assumes nothing: not that you know VSCode, not that you have ever
written a configuration file. Follow the steps in order.

The extension's own text — Settings UI, command palette, status bar, word
count — follows VSCode's display language: Spanish if VSCode is in Spanish,
English otherwise, with no setting of its own to override that (see
`docs/UBIQUITOUS_LANGUAGE.md`, **Interface language**). **This guide quotes
everything in English.** If your VSCode is in Spanish, look up the Spanish
wording in that same glossary.

Two conventions used throughout:

- Shortcuts are written `Cmd+X` (macOS) / `Ctrl+X` (Windows/Linux).
- VSCode's own menus (not the extension's) are named in English, with the
  Spanish name in parentheses if your VSCode is in Spanish.

### 1. Install the extension

This project publishes tagged releases to the VS Code Marketplace and to the
Open VSX Registry (search `Texto` by `asiermarques` in either). If a release
is already there, install it from the Extensions panel like any other
extension and skip to section 2. Building it yourself from source — the steps
below — is only needed to try an unreleased change.

1. Install [Node.js](https://nodejs.org) if you do not have it (the LTS
   version, whatever the big green button offers).
2. Open the *Terminal* app (macOS) or *PowerShell* (Windows), go to this
   project's folder and run these two lines, one at a time:

   ```sh
   npm install
   npx @vscode/vsce package
   ```

   The last line prints something like `DONE Packaged: …/texto-0.1.0.vsix`.
   That `.vsix` file is the extension — the version number in its name comes
   from `package.json`.
3. Open VSCode. In the left bar click the *Extensions* (*Extensiones*) icon —
   the four little squares.
4. At the top of that panel click the `…` menu → **Install from VSIX…**
   (*Instalar desde VSIX…*), and pick the `.vsix` file from step 2.
5. VSCode confirms the installation at the bottom right.
6. **Check it took.** Still in the Extensions panel, search `Texto`: it must
   appear under *Installed* (*Instalado*). Nothing else in this guide works
   until it does — the settings in section 5 do not even exist for VSCode
   until the extension that declares them is installed.

To update later, repeat steps 2–4; VSCode replaces the old version. Reload
any window already open — command palette → `Developer: Reload Window`
(*Desarrollador: Recargar ventana*) — since only new windows pick it up.

### 2. Open a Chapter in the Writing editor

A **Chapter** is one `.md` file. By default VSCode opens `.md` files in its
normal code editor, with all the `#` and `*` symbols showing. To see the same
file in the Writing editor, either:

- Right-click the `.md` file — in the *Explorer* (*Explorador*) or on its own
  tab — and choose **Open with Texto**. This is the fastest way, and it works
  on any `.md`, inside a **Writing space** or not.
- Or: command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) → type `Reopen Editor
  With` (*Volver a abrir el editor con*) → **Texto: Writing editor**.

The same file, now as prose. Section 3 makes this permanent for a whole
folder, so you never have to do either again.

If *Texto: Writing editor* (or *Open with Texto*) is not in that list, stop
here and go back to section 1 — the extension is not installed.

The way back — plain markdown, syntax and all — is the same menu's other
entry, **Open as markdown**. Handy inside a **Writing space** (section 3),
where `.md` files open in the Writing editor by default.

**One paragraph, one line.** Write each paragraph as a single line and let it
wrap on screen — press `Enter` when the paragraph ends, not when the line
looks long enough. Don't hand-wrap at 70–80 columns the way markdown often is
for code repositories: to the Writing editor, each of those lines is its own
paragraph, which breaks justified text (nothing to straighten, section 5.3)
and the measure (which changes with text size). Same convention as iA Writer
and Ulysses; the `.md` stays standard markdown either way — a single newline
was never a paragraph break.

Already have a Chapter hard-wrapped this way? VSCode's own **Join Lines**
(*Unir líneas*, `Ctrl+J` on the selected lines, in the normal markdown
editor) joins each paragraph back into one line.

### 3. Make a folder a Writing space

A **Writing space** is a folder whose `.md` files open in the Writing editor
straight away, no *Reopen Editor With…* each time. Set up a **Work** once and
forget about it. Do this first — the settings in section 5 only change how
the Writing editor looks, and a Chapter opening in the normal code editor
ignores them completely.

1. Open the **Work**'s folder in VSCode: *File → Open Folder…* (*Archivo →
   Abrir carpeta…*).
2. Press `Cmd+Shift+P` / `Ctrl+Shift+P`, type
   `Preferences: Open Workspace Settings (JSON)` (*Preferencias: Abrir
   configuración del área de trabajo (JSON)*), press `Enter`. VSCode creates
   and opens `.vscode/settings.json` inside that folder; if it is new it
   contains just `{}`.
3. Write this, exactly, and save with `Cmd+S` / `Ctrl+S`:

   ```json
   {
     "workbench.editorAssociations": {
       "*.md": "texto.editor"
     }
   }
   ```

4. Close and reopen a `.md` file. It comes up in the Writing editor.

This only affects that folder — `.md` elsewhere still opens in the normal
code editor. To see the raw markdown of a Chapter inside a Writing space:
command palette → `Reopen Editor With…` → *Text Editor* (*Editor de texto*).

Keep this block when adding the settings of section 5 to the same file; the
complete example is at the end of that section.

### 4. The two places a setting can live

Every option in section 5 is a *VSCode setting*, and VSCode stores settings
in two places — worth understanding, because it decides who the setting
applies to:

| Where | Called | Applies to |
| --- | --- | --- |
| Your own VSCode, on this computer | *User* (*Usuario*) | Everything you open, always |
| A file inside one folder, `.vscode/settings.json` | *Workspace* (*Área de trabajo*) | Only the files in that folder |

The second is a plain text file *inside* your **Work**'s folder — commit it
and the configuration travels with the text, on any computer, for anyone.
When a setting is in both places, the folder's file wins for its files.

That also decides where a change *lands*: the buttons in section 6 write to
the **Work**'s `.vscode/settings.json` if that file already sets the option,
otherwise a click would write a value the folder immediately overrides and
appear to do nothing. You never create that file by hand — VSCode did, in
section 3.

### 5. The settings, one by one

Four in total: **Editor theme**, **Text size**, **Alignment** and **Focus
mode**. Section 6 is the fast way to reach all four without leaving the
Chapter; this section is the reference for what each does and how to set it
permanently.

> **If VSCode greys these out, or marks them `Unknown Configuration Setting`
> (*Valor de configuración desconocido*), the file is fine — the extension is
> not installed.** A setting only exists for VSCode because an installed
> extension declares it; every `texto.*` setting below is declared by this
> one. Go back to section 1, and reload the window afterwards. The same goes
> for a Chapter that stubbornly stays dark: that is the normal code editor
> wearing your VSCode theme, not the Writing editor ignoring `texto.theme`.

#### 5.1. Editor theme (`texto.theme`)

The Writing editor has its own colour palette, separate from VSCode's — a
dark VSCode around a page of white paper is normal. It colours the **Writing
editor only**; VSCode's own windows, panels and code editor keep their usual
theme, which is what you want but also the thing that most often looks like
a bug.

| Value | What you get |
| --- | --- |
| `light` | Paper background, dark ink. **The default.** |
| `dark` | Dark background, light ink. |
| `vscode` | The Writing editor follows VSCode's active theme, and changes with it. |

**The short way (recommended).** No files, just a dropdown:

1. Press `Cmd+,` / `Ctrl+,` to open *Settings* (*Configuración*).
2. In the search box at the top, type `texto`.
3. You get a section titled **Texto** with a dropdown for the **theme**
   setting, described as *The Writing editor's own theme*. Pick `light`, `dark`
   or `vscode`.
4. Nothing to save. Any open Chapter changes colour immediately.

That dropdown writes to *User* settings, applying everywhere. To scope it to
one **Work**'s folder instead, click the **Workspace** (*Área de trabajo*)
tab under the search box *before* choosing the value.

**The long way (the file itself).** For a folder you're setting up to
commit: open `.vscode/settings.json` as in section 3, and add the setting
*next to* what's already there — replacing the file drops the
`workbench.editorAssociations` block and the Chapter goes back to the code
editor:

```json
{
  "workbench.editorAssociations": {
    "*.md": "texto.editor"
  },
  "texto.theme": "dark"
}
```

The quotes, the colon, the commas between entries and the braces all matter; if
you get one wrong VSCode underlines it in red and tells you what it expected.

#### 5.2. Text size (`texto.textSize`)

The body text's size, in pixels — 14 to 28, 18 by default. Separate from
VSCode's own zoom (`Cmd+=`/`Cmd+-`, which resizes the whole window): this
only affects the Writing editor, and the column's measure grows with it, so
characters-per-line stays comfortable at any size.

**While writing**, from inside the Chapter itself:

| Action | Shortcut |
| --- | --- |
| Increase | `Cmd+=` / `Ctrl+=` |
| Decrease | `Cmd+-` / `Ctrl+-` |
| Reset | `Cmd+0` / `Ctrl+0` |

If your platform's window manager steals `Cmd+=`/`Cmd+-` first (it's also
VSCode's own zoom shortcut), use `Cmd+Alt+=` / `Cmd+Alt+-` instead — always
active, no configuration needed. Same three actions in the command palette:
`Texto: Increase text size`, `Texto: Decrease text size`, `Texto: Reset text
size`.

**Permanently**, same two ways as the theme — the **text size** field under
*Settings* → search `texto`, or in the JSON file:

```json
{
  "texto.textSize": 22
}
```

#### 5.3. Alignment (`texto.alignment`)

Left-aligned by default. `justified` straightens both edges of the column,
like a printed book, with automatic hyphenation so Spanish's longer words
don't open rivers of white space — the two go together, hyphenation isn't
offered on its own.

| Value | What you get |
| --- | --- |
| `left` | Left-aligned. **The default.** |
| `right` | Right-aligned. |
| `justified` | Justified, with hyphenation. |

Justified only straightens paragraphs long enough to wrap — the last line
stays ragged, as in a printed book. A paragraph broken by hand into several
file lines is several paragraphs to the editor, none of them justified; see
*One paragraph, one line* in section 2.

Same two ways as every setting — the **alignment** dropdown under *Settings*
→ search `texto`, or:

```json
{
  "texto.alignment": "justified"
}
```

#### 5.4. Focus mode (`texto.focusMode`)

Focus mode dims the whole Chapter except the block your cursor is in —
paragraph, heading, quote, list item or **Scene break**. **On by default**.

**Turning it on and off while writing** — the way you'll actually use it:

1. Press `Cmd+Shift+P` / `Ctrl+Shift+P`.
2. Type `Texto: Toggle focus mode`, press `Enter`. Each run flips it.

Worth a keyboard shortcut of its own: `Cmd+K` then `Cmd+S` opens *Keyboard
Shortcuts* (*Métodos abreviados de teclado*), search `Toggle focus mode`,
double-click the row and press your keys.

**Permanently** — same two ways as the theme: the **focus mode** checkbox
under *Settings* → search `texto`, or in the JSON file:

```json
{
  "texto.focusMode": false
}
```

The palette command always writes to *User* settings, globally: Focus mode
is a preference of the **Author**, not a property of one Chapter.

#### 5.5. The whole file

A complete `.vscode/settings.json` for a **Work**, association and all four
settings:

```json
{
  "workbench.editorAssociations": {
    "*.md": "texto.editor"
  },
  "texto.theme": "light",
  "texto.textSize": 18,
  "texto.alignment": "left",
  "texto.focusMode": true
}
```

Commit that file with the text and the **Work** carries its own configuration.
Section 7 extends this same file with the settings that put the rest of
VSCode into writing mode.

### 6. The status bar: word count and the settings toolbar

With a Chapter open, the status bar (the strip along the very bottom) shows
the Chapter's **word count**. Select text and the selection count joins it —
`1204 words (37 selected)` — and disappears when you click away. It only
counts prose: a heading's `##`, emphasis's `*`, a **Scene break**'s `---`
are not words, so the number matches what Google Docs would show for the
same text.

Right next to it, a row of small buttons — one per setting from section 5,
plus one more. Nothing to open or search: each acts the moment you click it,
showing a `$(check)` mark, an eye, a book, whichever tells you its current
value at a glance.

| Buttons | What clicking one does |
| --- | --- |
| **Theme Light** · **Theme Dark** · **Theme VSCode** | Switches the theme (5.1). The active one is marked. |
| **−** · `18px` · **+** | Text size (5.2): reduce, restore the factory size, increase. |
| **Left** · **Just** · **Right** | Alignment (5.3). The active one is marked. |
| $(eye)/$(eye-closed) **Focus mode** | Toggles Focus mode (5.4). The icon shows whether it is on. |
| $(book)/$(code) **Raw markdown** | See below. |

**Raw markdown.** Shows the Chapter exactly as it is in the file — every `#`,
`*`, `---` — with Live preview and Focus mode's dimming off, in place, no
tab change. Click again (or run `Texto: Raw markdown`) to go back; cursor
stays put. **Not** a setting — nothing is saved, a Chapter always opens
composed. For the raw markdown in a proper code editor instead (to search,
edit as text), use *Open as markdown* (section 2).

None of this adds anything to the Chapter itself (DEC-002): the writing
surface stays exactly as many pixels as the text needs.

### 7. Turning off VSCode's navigation for a Writing space

The extension can't remove VSCode's own chrome — breadcrumb bar, minimap,
line numbers, vertical ruler — it's VSCode's workbench, configured the
ordinary way. A **Writing space** carries that configuration in the same
`.vscode/settings.json` as section 3, so opening the folder puts the whole
window into writing mode:

```json
{
  "workbench.editorAssociations": {
    "*.md": "texto.editor"
  },

  "breadcrumbs.enabled": false,
  "editor.minimap.enabled": false,
  "editor.lineNumbers": "off",
  "editor.rulers": [],
  "editor.glyphMargin": false,

  "texto.theme": "light",
  "texto.focusMode": true,
  "texto.textSize": 18,
  "texto.alignment": "left"
}
```

A copy of this exact file lives at
[`examples/espacio-de-escritura/.vscode/settings.json`](examples/espacio-de-escritura/.vscode/settings.json)
in this repository — copy the whole `.vscode` folder into a **Work**'s root
and commit it.

Those five workbench settings (everything except `texto.*`) are ordinary
VSCode configuration — they work the same with the extension not installed,
which is why there's no button for them in section 6 or a command that
writes this file for you (AD-005): the writing environment is configuration
versioned next to the text, not a feature. They apply to the **whole
window**, not just Chapters — a `package.json` or `.gitignore` in the same
**Work** shows the same stripped-down chrome. That's the point: the folder
*is* a writing environment.

### 8. Upgrading a Writing space built before the English rename

Every `texto.*` key and value, and the Writing editor's `viewType`, used to
be Spanish (`texto.tema`, `texto.modoFoco`, `claro`/`oscuro`,
`izquierda`/`derecha`/`justificado`, `texto.editorDeEscritura`). The rename
is breaking on purpose, no alias — a **Writing space** built against the old
names keeps its `.vscode/settings.json` untouched, silently, until you edit
it by hand. Two symptoms tell you it needs updating:

- **A Chapter opens in VSCode's plain markdown editor instead of the Writing
  editor.** `workbench.editorAssociations` still points at
  `texto.editorDeEscritura`. Fix: replace it with `texto.editor` (section
  3's snippet). Meanwhile, reach the Writing editor with **Open with Texto**
  (section 2).
- **A Chapter opens in the Writing editor with the factory look, ignoring
  the folder's settings.** The old keys (`texto.tema`, `texto.modoFoco`,
  `texto.tamanoDeTexto`, `texto.alineacion`) go unrecognised, so it falls
  back to defaults, quietly. Fix: rename each to its English form
  (`texto.theme`, `texto.focusMode`, `texto.textSize`, `texto.alignment`)
  and its value where it's an enum (`claro`→`light`, `oscuro`→`dark`,
  `izquierda`→`left`, `derecha`→`right`, `justificado`→`justified`;
  `vscode` is unchanged). Section 5.5 has the complete file to copy from.

Neither symptom raises an error — the accepted cost of the rename, not a bug
to report.

### 9. If something does not work

Nine times out of ten it's one of the first two:

- **Settings greyed out, or `Unknown Configuration Setting`.** Not installed
  in *this* VSCode. Extensions panel → search `Texto` → must be under
  *Installed*. Install it (section 1), then `Developer: Reload Window`.
  VSCode only honours settings some installed extension declared, and
  ignores the rest in silence.
- **The Chapter is a different colour than `texto.theme` says.** You're
  looking at VSCode's normal code editor, not the Writing editor. Reopen it
  with *Reopen Editor With…* → **Texto: Writing editor** (section 2), then
  set up the folder as a **Writing space** (section 3) so it stays that way.
- **The `.md` still opens with symbols showing.** The association wasn't
  picked up: check the file is under the folder VSCode opened, the path is
  exactly `.vscode/settings.json`, and the value is `texto.editor` — if it's
  `texto.editorDeEscritura`, see section 8.
- **A `texto.*` setting stopped the file opening as prose.** You replaced
  `settings.json`'s contents instead of adding to it, dropping the
  `workbench.editorAssociations` block. See 5.5 for the whole file.
- **`Texto: Toggle focus mode` missing from the palette.** Same as the first
  entry — not installed, or the window predates the install.
- **`settings.json` underlined in red.** A missing or trailing comma; hover
  the underline for what VSCode expected.
- **The theme didn't change.** Only `light` / `dark` / `vscode` are valid;
  anything else — including the old Spanish values — falls back to `light`.
- **`Cmd+=`/`Cmd+-` zoom the window instead of resizing the text.** Your
  platform stole the shortcut first. Use `Cmd+Alt+=` / `Cmd+Alt+-` (always
  active) or the palette commands.
- **"Raw markdown" turned off after reopening the Chapter.** Intended: it's
  panel state, not a setting, and a Chapter always opens composed.
- **Breadcrumb / minimap / line numbers still there.** Either the folder is
  missing section 7's settings, or the file is outside it — both are
  workspace-scoped, like the association in section 3.

### 10. What the Writing editor composes

The Writing editor is for fiction and non-fiction alike (`docs/PRODUCT.md`,
PD-007). Everything below is markdown syntax, hidden while the cursor is
elsewhere and revealed while it touches the text it marks — the file on disk
always stays exactly what you typed.

**Composed:**

| Construct | Written as | Reads as |
| --- | --- | --- |
| Heading | `## Title`, or `Title` over `====`/`----` (setext) | Sized, weighted title |
| Strong / emphasis | `**text**` / `*text*` | Bold / italic |
| Strikethrough | `~~text~~` | Struck through |
| Inline code | `` `code` `` | Monospaced, on a discreet ground |
| Escape | `\*` | The literal character, backslash hidden |
| Scene break | `---` on its own, blank line above | Centred `⁂` |
| Blockquote | `> text` | Indented, with a left rail |
| List (bullet/ordered) | `- item` / `1. item` | A bullet or number, indented by nesting depth |
| Task / task list | `- [ ] item` / `- [x] item` | A clickable box, empty or ticked |
| Link (inline, reference, autolink, bare URL) | `[text](url)`, `[text][ref]`, `<url>`, a bare `https://…` | Underlined text, target hidden (hover or `Cmd`/`Ctrl`+click to see/follow it) |
| Image | `![alt](url)` | Its alternative text, marked distinctly from a Link — never the picture itself |
| Code block (fenced or indented) | ` ```lang…``` ` or a 4-space indent | Preformatted, monospaced, never justified |
| Diagram | ` ```mermaid…``` ` | The picture the source describes — see below |
| Table | `\| Name \| Role \|` over `\| --- \| --- \|` | An aligned grid, pipes hidden, ruled under the header |
| Footnote | `text[^1]` … `[^1]: note` | The call as a superscript, the note apart from the prose |
| Reference definition | `[ref]: url` | A discreet line, apart from the prose |
| Frontmatter | `---`-fenced YAML or `+++`-fenced TOML, at the very top | Folded out of sight; the Frontmatter button in the toolbar brings it back |

**Diagrams.** A code block fenced ` ```mermaid ` is drawn as the picture its
source describes — flowcharts, sequence, class, state and ER diagrams. Put
the cursor anywhere inside it and the whole block turns back into the source
to edit; move the cursor out, or click the picture to get in. The file on
disk is only ever the mermaid source you wrote: nothing is inserted, and the
picture is never written back. It's the one thing in this editor that is
drawn rather than styled, so it also carries its own palette rather than the
editor theme's, and the renderer it needs is only downloaded by a chapter
that actually contains a diagram. A diagram that can't be drawn — because
you're halfway through writing it — simply shows its source.

**Not composed, shown and kept exactly as written:**

- **HTML**, inline or block.
- **Syntax colouring inside a Code block.** One colour, preformatted — this
  editor quotes code, it doesn't highlight it. A **Diagram** is the one
  exception, and it isn't colouring: it's a different picture entirely.

**The `---` rule.** Directly under a line of prose, with no blank line
between them, `---` is a setext heading (CommonMark's own reading — the line
above becomes an H2). With a blank line above it, `---` is a **Scene break**.
The same three dashes, two different meanings, decided by nothing more than
whether you pressed Enter twice or once before typing them — every **Scene
break** already in this project's own history is written the second way, so
nothing here changes on its own.

**From the keyboard**, once something is selected (or, for the first two,
even without a selection):

| Shortcut | Does |
| --- | --- |
| `Cmd+B` / `Ctrl+B` | Wraps/unwraps the selection in `**` (strong) |
| `Cmd+I` / `Ctrl+I` | Wraps/unwraps the selection in `*` (emphasis) |
| `Cmd+K` / `Ctrl+K` | Wraps the selection as `[text]()`, cursor left on the target |
| `Cmd+Alt+K` / `Ctrl+Alt+K` | Same as `Cmd+K` — use this if your VSCode swallows `Cmd+K` first as its own shortcut chord (`Cmd+K Cmd+S`, `Cmd+K V`, …) |
| Paste a URL over a selection | Turns the selection into a Link with the pasted URL as target; pasting over a selection that already is a Link's text replaces only its target |
| `Enter` inside a list item, a Task or a blockquote | Continues it — next bullet, next number, an empty (unchecked) Task box, another `>` — and on an *empty* item, removes the marker and leaves the block instead |
| Click a Task's box | Toggles `[ ]` ↔ `[x]` in the file |
| `Cmd`/`Ctrl`+click a Link | Opens its target with VSCode's own link handling — the Writing editor never navigates on its own |

---

## Development

```sh
npm install
npm run build        # bundles the extension and the webview into dist/
npm run watch        # same, in watch mode
npm run typecheck    # tsc --noEmit over the whole project
```

To try it without installing: open this folder and press `F5` (*Run and
Debug → Run Extension*) — a second VSCode window opens with the extension
loaded from source.

## Tests

```sh
npm run test:unit          # vitest — the pure logic in src/domain
npm run test:performance   # vitest — Operation count + bundle bytes vs a committed baseline
npm run report:performance # prints current measurements next to the baseline; writes nothing
npm run test:integration   # @vscode/test-electron — a real VSCode, end to end
npm test                   # all three
```

The first `test:integration` run downloads a copy of VSCode into
`.vscode-test/` (not distributed, only used to run the tests).

`test:performance` builds first and compares a handful of deterministic
metrics (full parses per keystroke and per cursor move, decorations built,
bundle bytes) against `test/performance/baseline.json`, failing on any
difference — a regression or an unrecorded improvement alike. It also runs
from a versioned pre-commit hook (enabled automatically on `npm install`)
and as a step in CI, so a skipped hook still gets caught.

`TEXTO_TEST_FILTER=<substring> npm run test:integration` runs only the
integration files whose name contains `<substring>` — faster than a full
VSCode boot on every change. Unset, it runs the whole suite, which CI and
any task's closing check always use.

## Layout

See *Conventions* in `docs/ARCHITECTURE.md`.

## License

MIT — see [LICENSE](LICENSE).
