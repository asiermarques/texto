# Getting started

This guide assumes nothing: not that you know VSCode, not that you have ever
written a configuration file. Follow the steps in order.

The extension's own text — Settings UI, command palette, status bar, word
count — follows VSCode's display language: Spanish if VSCode is in Spanish,
English otherwise, with no setting of its own to override that (see
[../UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md), **Interface
language**). **This guide quotes everything in English.** If your VSCode is in
Spanish, look up the Spanish wording in that same glossary.

Two conventions used throughout:

- Shortcuts are written `Cmd+X` (macOS) / `Ctrl+X` (Windows/Linux).
- VSCode's own menus (not the extension's) are named in English, with the
  Spanish name in parentheses if your VSCode is in Spanish.

Once you are set up: [settings.md](settings.md) is the reference for every
option, [markdown.md](markdown.md), [tables.md](tables.md) and
[diagrams.md](diagrams.md) cover what the editor composes, and
[troubleshooting.md](troubleshooting.md) is there when something looks wrong.

## Install the extension

Texto is published to the [VS Code
Marketplace](https://marketplace.visualstudio.com/items?itemName=asiermarques.texto)
and to [Open VSX](https://open-vsx.org/extension/asiermarques/texto):

1. Open VSCode. In the left bar click the *Extensions* (*Extensiones*) icon —
   the four little squares.
2. Search `Texto` by `asiermarques` and click **Install** (*Instalar*).
3. **Check it took.** Still in the Extensions panel, `Texto` must appear under
   *Installed* (*Instalado*). Nothing else in this guide works until it does —
   the `texto.*` settings do not even exist for VSCode until the extension
   that declares them is installed.

VSCode updates it on its own from then on. Reload any window that was already
open — command palette → `Developer: Reload Window` (*Desarrollador: Recargar
ventana*) — since only new windows pick up a new version.

**From source instead**, to try an unreleased change: package it with `npx
@vscode/vsce package` and install the resulting `.vsix` from the Extensions
panel's `…` menu → **Install from VSIX…** (*Instalar desde VSIX…*). The steps
in full are in [../DEVELOPMENT.md](../DEVELOPMENT.md).

## Open a Chapter in the Writing editor

A **Chapter** is one `.md` file. By default VSCode opens `.md` files in its
normal code editor, with all the `#` and `*` symbols showing. To see the same
file in the Writing editor, either:

- Right-click the `.md` file — in the *Explorer* (*Explorador*) or on its own
  tab — and choose **Open with Texto**. This is the fastest way, and it works
  on any `.md`, inside a **Writing space** or not.
- Or: command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) → type `Reopen Editor
  With` (*Volver a abrir el editor con*) → **Texto: Writing editor**.

The same file, now as prose. [Make a folder a Writing
space](#make-a-folder-a-writing-space) makes this permanent for a whole
folder, so you never have to do either again.

If *Texto: Writing editor* (or *Open with Texto*) is not in that list, stop
here and go back to [Install the extension](#install-the-extension) — the
extension is not installed.

The way back — plain markdown, syntax and all — is the same menu's other
entry, **Open as markdown**. Handy inside a **Writing space** ([Writing
space](#make-a-folder-a-writing-space)), where `.md` files open in the Writing
editor by default.

**One paragraph, one line.** Write each paragraph as a single line and let it
wrap on screen — press `Enter` when the paragraph ends, not when the line
looks long enough. Don't hand-wrap at 70–80 columns the way markdown often is
for code repositories: to the Writing editor, each of those lines is its own
paragraph, which breaks justified text (nothing to straighten,
[Alignment](settings.md#alignment-textoalignment)) and the measure (which
changes with text size). Same convention as iA Writer and Ulysses; the `.md`
stays standard markdown either way — a single newline was never a paragraph
break.

Already have a Chapter hard-wrapped this way? VSCode's own **Join Lines**
(*Unir líneas*, `Ctrl+J` on the selected lines, in the normal markdown editor)
joins each paragraph back into one line.

## Make a folder a Writing space

A **Writing space** is a folder whose `.md` files open in the Writing editor
straight away, no *Reopen Editor With…* each time. Set up a **Work** once and
forget about it. Do this first — the settings in [the settings](settings.md)
only change how the Writing editor looks, and a Chapter opening in the normal
code editor ignores them completely.

1. Open the **Work**'s folder in VSCode: *File → Open Folder…* (*Archivo →
   Abrir carpeta…*).
2. Press `Cmd+Shift+P` / `Ctrl+Shift+P`, type `Preferences: Open Workspace
   Settings (JSON)` (*Preferencias: Abrir configuración del área de trabajo
   (JSON)*), press `Enter`. VSCode creates and opens `.vscode/settings.json`
   inside that folder; if it is new it contains just `{}`.
3. Write this, exactly, and save with `Cmd+S` / `Ctrl+S`:

   ```json
   {
     "workbench.editorAssociations": {
       "*.md": "texto.editor"
     }
   }
   ```

4. Close and reopen a `.md` file. It comes up in the Writing editor.

This only affects that folder — `.md` elsewhere still opens in the normal code
editor. To see the raw markdown of a Chapter inside a Writing space: command
palette → `Reopen Editor With…` → *Text Editor* (*Editor de texto*).

Keep this block when adding the settings of [the settings](settings.md) to the
same file; the complete example is at the end of that section.
