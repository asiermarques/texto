# Settings

Four settings — **Editor theme**, **Text size**, **Alignment** and **Focus
mode** — plus the status bar that reaches all four without leaving the
**Chapter**, and the VSCode configuration that puts the rest of the window
into writing mode. If you have not opened a **Chapter** yet, start with
[getting-started.md](getting-started.md).

## The two places a setting can live

Every option in [the settings](settings.md) is a *VSCode setting*, and VSCode
stores settings in two places — worth understanding, because it decides who
the setting applies to:

| Where | Called | Applies to |
| --- | --- | --- |
| Your own VSCode, on this computer | *User* (*Usuario*) | Everything you open, always |
| A file inside one folder, `.vscode/settings.json` | *Workspace* (*Área de trabajo*) | Only the files in that folder |

The second is a plain text file *inside* your **Work**'s folder — commit it
and the configuration travels with the text, on any computer, for anyone. When
a setting is in both places, the folder's file wins for its files.

That also decides where a change *lands*: the buttons in [the status
bar](#the-status-bar-word-count-and-the-settings-toolbar) write to the
**Work**'s `.vscode/settings.json` if that file already sets the option,
otherwise a click would write a value the folder immediately overrides and
appear to do nothing. You never create that file by hand — VSCode did, in
[Make a folder a Writing
space](getting-started.md#make-a-folder-a-writing-space).

## The settings, one by one

Four in total: **Editor theme**, **Text size**, **Alignment** and **Focus
mode**. [the status bar](#the-status-bar-word-count-and-the-settings-toolbar)
is the fast way to reach all four without leaving the Chapter; this section is
the reference for what each does and how to set it permanently.

> **If VSCode greys these out, or marks them `Unknown Configuration Setting`
> (*Valor de configuración desconocido*), the file is fine — the extension is
> not installed.** A setting only exists for VSCode because an installed
> extension declares it; every `texto.*` setting below is declared by this
> one. Go back to [Install the
> extension](getting-started.md#install-the-extension), and reload the window
> afterwards. The same goes for a Chapter that stubbornly stays dark: that is
> the normal code editor wearing your VSCode theme, not the Writing editor
> ignoring `texto.theme`.

### Editor theme (`texto.theme`)

The Writing editor has its own colour palette, separate from VSCode's — a dark
VSCode around a page of white paper is normal. It colours the **Writing editor
only**; VSCode's own windows, panels and code editor keep their usual theme,
which is what you want but also the thing that most often looks like a bug.

| Value | What you get |
| --- | --- |
| `light` | Paper background, dark ink. **The default.** |
| `dark` | Dark background, light ink. |
| `vscode` | The Writing editor follows VSCode's active theme, and changes with it. |

**The short way (recommended).** No files, just a dropdown:

1. Press `Cmd+,` / `Ctrl+,` to open *Settings* (*Configuración*).
2. In the search box at the top, type `texto`.
3. You get a section titled **Texto** with a dropdown for the **theme**
   setting, described as *The Writing editor's own theme*. Pick `light`,
   `dark` or `vscode`.
4. Nothing to save. Any open Chapter changes colour immediately.

That dropdown writes to *User* settings, applying everywhere. To scope it to
one **Work**'s folder instead, click the **Workspace** (*Área de trabajo*) tab
under the search box *before* choosing the value.

**The long way (the file itself).** For a folder you're setting up to commit:
open `.vscode/settings.json` as in [Make a folder a Writing
space](getting-started.md#make-a-folder-a-writing-space), and add the setting
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

The quotes, the colon, the commas between entries and the braces all matter;
if you get one wrong VSCode underlines it in red and tells you what it
expected.

### Text size (`texto.textSize`)

The body text's size, in pixels — 14 to 28, 18 by default. Separate from
VSCode's own zoom (`Cmd+=`/`Cmd+-`, which resizes the whole window): this only
affects the Writing editor, and the column's measure grows with it, so
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

### Alignment (`texto.alignment`)

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
*One paragraph, one line* in [Open a
Chapter](getting-started.md#open-a-chapter-in-the-writing-editor).

Same two ways as every setting — the **alignment** dropdown under *Settings* →
search `texto`, or:

```json
{
  "texto.alignment": "justified"
}
```

### Focus mode (`texto.focusMode`)

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

The palette command always writes to *User* settings, globally: Focus mode is
a preference of the **Author**, not a property of one Chapter.

### The whole file

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
[VSCode's navigation](#turning-off-vscodes-navigation-for-a-writing-space)
extends this same file with the settings that put the rest of VSCode into
writing mode.

## The status bar: word count and the settings toolbar

With a Chapter open, the status bar (the strip along the very bottom) shows
the Chapter's **word count**. Select text and the selection count joins it —
`1204 words (37 selected)` — and disappears when you click away. It only
counts prose: a heading's `##`, emphasis's `*`, a **Scene break**'s `---` are
not words, so the number matches what Google Docs would show for the same
text.

Right next to it, a row of small buttons — one per setting from [the
settings](settings.md), plus one more. Nothing to open or search: each acts
the moment you click it, showing a `$(check)` mark, an eye, a book, whichever
tells you its current value at a glance.

| Buttons | What clicking one does |
| --- | --- |
| **Theme Light** · **Theme Dark** · **Theme VSCode** | Switches the theme ([Editor theme](#editor-theme-textotheme)). The active one is marked. |
| **−** · `18px` · **+** | Text size ([Text size](#text-size-textotextsize)): reduce, restore the factory size, increase. |
| **Left** · **Just** · **Right** | Alignment ([Alignment](#alignment-textoalignment)). The active one is marked. |
| $(eye)/$(eye-closed) **Focus mode** | Toggles Focus mode ([Focus mode](#focus-mode-textofocusmode)). The icon shows whether it is on. |
| $(book)/$(code) **Raw markdown** | See below. |

**Raw markdown.** Shows the Chapter exactly as it is in the file — every `#`,
`*`, `---` — with Live preview and Focus mode's dimming off, in place, no tab
change. Click again (or run `Texto: Raw markdown`) to go back; cursor stays
put. **Not** a setting — nothing is saved, a Chapter always opens composed.
For the raw markdown in a proper code editor instead (to search, edit as
text), use *Open as markdown* ([Open a
Chapter](getting-started.md#open-a-chapter-in-the-writing-editor)).

None of this adds anything to the Chapter itself (DEC-002): the writing
surface stays exactly as many pixels as the text needs.

## Turning off VSCode's navigation for a Writing space

The extension can't remove VSCode's own chrome — breadcrumb bar, minimap, line
numbers, vertical ruler — it's VSCode's workbench, configured the ordinary
way. A **Writing space** carries that configuration in the same
`.vscode/settings.json` as [Make a folder a Writing
space](getting-started.md#make-a-folder-a-writing-space), so opening the
folder puts the whole window into writing mode:

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
[`examples/espacio-de-escritura/.vscode/settings.json`](../../examples/espacio-de-escritura/.vscode/settings.json)
in this repository — copy the whole `.vscode` folder into a **Work**'s root
and commit it.

Those five workbench settings (everything except `texto.*`) are ordinary
VSCode configuration — they work the same with the extension not installed,
which is why there's no button for them in [the status
bar](#the-status-bar-word-count-and-the-settings-toolbar) or a command that
writes this file for you (AD-005): the writing environment is configuration
versioned next to the text, not a feature. They apply to the **whole window**,
not just Chapters — a `package.json` or `.gitignore` in the same **Work**
shows the same stripped-down chrome. That's the point: the folder *is* a
writing environment.
