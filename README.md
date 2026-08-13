# Texto

A prose writing editor for markdown, inside VSCode. Hidden markdown syntax,
readable typography, no distractions; the texts stay as `.md` files in a git
repository.

See `docs/PRODUCT.md` for the why and `docs/ARCHITECTURE.md` for the how.

---

## Guide for the Author

This part assumes nothing: not that you know VSCode, not that you have ever
written a configuration file. Follow the steps in order. The extension's own
menus and labels are in Spanish (that is on purpose — the Author writes in
Spanish), so every button you have to click is quoted below exactly as it
appears on screen.

Two conventions used throughout:

- Keyboard shortcuts are written `Cmd+X` for macOS and `Ctrl+X` for
  Windows/Linux. Use the one for your machine.
- VSCode's own menus are named in English here. If your VSCode is in Spanish,
  the Spanish name is in parentheses right after it.

### 1. Install the extension

The extension is not on the marketplace; you install it from a file you build
once.

1. Install [Node.js](https://nodejs.org) if you do not have it (the LTS
   version, whatever the big green button offers).
2. Open the *Terminal* app (macOS) or *PowerShell* (Windows), go to this
   project's folder and run these three lines, one at a time:

   ```sh
   npm install
   npm run build
   npx @vscode/vsce package
   ```

   The last line prints something like `DONE Packaged: …/texto-0.0.1.vsix`.
   That `.vsix` file is the extension.
3. Open VSCode. In the left bar click the *Extensions* (*Extensiones*) icon —
   the four little squares.
4. At the top of that panel click the `…` menu → **Install from VSIX…**
   (*Instalar desde VSIX…*), and pick the `texto-0.0.1.vsix` file from step 2.
5. VSCode confirms the installation at the bottom right.
6. **Check it took.** Still in the Extensions panel, search `Texto`: it must
   appear under *Installed* (*Instalado*). Nothing else in this guide works
   until it does — the settings in section 5 do not even exist for VSCode
   until the extension that declares them is installed.

To update it later, repeat steps 2–4 with the new build; VSCode replaces the
old version. Extensions are only picked up by windows opened afterwards, so
reload any window you already had open: command palette → `Developer: Reload
Window` (*Desarrollador: Recargar ventana*).

### 2. Open a Chapter in the Prose editor

A **Chapter** is one `.md` file. By default VSCode opens `.md` files in its
normal code editor, with all the `#` and `*` symbols showing. To see the same
file in the Prose editor:

1. Open the `.md` file as usual (double-click it in the *Explorer*
   (*Explorador*), the file list on the left).
2. Press `Cmd+Shift+P` / `Ctrl+Shift+P`. A text box drops down from the top:
   this is the **command palette**, where every VSCode action can be typed by
   name. You will use it a lot.
3. Type `Reopen Editor With` (*Volver a abrir el editor con*), press `Enter`.
4. From the list, choose **Editor de escritura**.

The same file, now as prose. Section 3 makes this permanent, so you never have
to do it again.

If *Editor de escritura* is not in that list, stop here and go back to section
1: the extension is not installed, and nothing below will have any effect.

### 3. Make a folder a Writing space

A **Writing space** is a folder whose `.md` files open in the Prose editor
straight away, with no *Reopen Editor With…* every single time. This is how you
set up a **Work** once and forget about it — and it is the first thing to do,
because the two settings in section 5 only change how the *Prose editor* looks.
A Chapter still opening in the normal code editor ignores them completely.

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
       "*.md": "texto.editorDeEscritura"
     }
   }
   ```

4. Close and reopen a `.md` file. It comes up in the Prose editor.

This only affects that folder: `.md` files anywhere else still open in the
normal code editor. And inside a **Writing space** you can still reach the plain
text of a Chapter — command palette → `Reopen Editor With…` → *Text Editor*
(*Editor de texto*) — which is what you want when you need to see the raw
markdown.

Keep this block when you add the settings of section 5 to the same file; the
complete example is at the end of that section.

### 4. The two places a setting can live

Every option in section 5 is a *VSCode setting*, and VSCode stores settings in
two different places. This is the one concept worth understanding, because it
decides who the setting applies to:

| Where | Called | Applies to |
| --- | --- | --- |
| Your own VSCode, on this computer | *User* (*Usuario*) | Everything you open, always |
| A file inside one folder, `.vscode/settings.json` | *Workspace* (*Área de trabajo*) | Only the files in that folder |

The second one is a plain text file that sits *inside* your **Work**'s folder,
so it travels with the text: commit it to git and the folder keeps its
configuration on any computer, and for anyone else who opens it.

When the same setting is in both places, the folder's file wins for the files
in that folder.

You do not have to create that file by hand — VSCode writes it for you, as you
already saw in section 3.

### 5. The settings, one by one

There are exactly two: the **Editor theme** and **Focus mode**.

> **If VSCode greys these out, or marks them `Unknown Configuration Setting`
> (*Valor de configuración desconocido*), the file is fine — the extension is
> not installed.** A setting only exists for VSCode because an installed
> extension declares it; `texto.tema` and `texto.modoFoco` are declared by this
> one. Go back to section 1, and reload the window afterwards. The same goes
> for a Chapter that stubbornly stays dark: that is the normal code editor
> wearing your VSCode theme, not the Prose editor ignoring `texto.tema`.

#### 5.1. Editor theme (`texto.tema`)

The Prose editor has its own colour palette, separate from VSCode's. You can
have a dark VSCode around a page of white paper. It colours the **Prose editor
only** — VSCode's own windows, panels and code editor keep their usual theme,
which is what you want and also the thing that most often looks like a bug.

| Value | What you get |
| --- | --- |
| `claro` | Paper background, dark ink. **The default** — this is what you see if you never touch the setting. |
| `oscuro` | Dark background, light ink. |
| `vscode` | The Prose editor follows VSCode's active theme, and changes with it. |

**The short way (recommended).** No files, just a dropdown:

1. Press `Cmd+,` / `Ctrl+,` to open *Settings* (*Configuración*).
2. In the search box at the top, type `texto`.
3. You get a section titled **Texto** with a dropdown labelled **Tema**:
   *Tema del Editor de escritura*. Pick `claro`, `oscuro` or `vscode`.
4. Nothing to save. Any open Chapter changes colour immediately.

That dropdown writes to *User* settings, so it applies everywhere. To write it
into one **Work**'s folder instead, click the **Workspace** (*Área de trabajo*)
tab just under the search box *before* choosing the value — same dropdown, saved
in the folder.

**The long way (the file itself).** If you would rather see the file, or you are
setting up a folder to commit: open `.vscode/settings.json` the same way as in
section 3, and add the setting *next to* what is already in there — do not
replace the file, or you will drop the `workbench.editorAssociations` block and
the Chapter will go back to opening in the code editor:

```json
{
  "workbench.editorAssociations": {
    "*.md": "texto.editorDeEscritura"
  },
  "texto.tema": "oscuro"
}
```

The quotes, the colon, the commas between entries and the braces all matter; if
you get one wrong VSCode underlines it in red and tells you what it expected.

#### 5.2. Focus mode (`texto.modoFoco`)

Focus mode dims the whole Chapter except the block your cursor is in — the
current paragraph, heading, quote, list item or **Scene break**. It is **on by
default**.

**Turning it on and off while writing** — the way you will actually use it:

1. Press `Cmd+Shift+P` / `Ctrl+Shift+P`.
2. Type `Texto: Alternar modo foco`, press `Enter`.

Each time you run it, it flips. It is worth giving this one a keyboard
shortcut of its own: press `Cmd+K` then `Cmd+S` to open *Keyboard Shortcuts*
(*Métodos abreviados de teclado*), search `Alternar modo foco`, double-click the
row and press the keys you want to use.

**Setting it permanently** — same two ways as the theme: the checkbox labelled
**Modo Foco** under *Settings* → search `texto`, or in the JSON file:

```json
{
  "texto.modoFoco": false
}
```

One thing to know: the command in the palette always writes your choice to
*User* settings, globally. Focus mode is a preference of the **Author**, not a
property of one Chapter — you either like writing that way or you do not.

#### 5.3. The whole file

A complete `.vscode/settings.json` for a **Work**, with the association of
section 3 and both settings, looks like this:

```json
{
  "workbench.editorAssociations": {
    "*.md": "texto.editorDeEscritura"
  },
  "texto.tema": "claro",
  "texto.modoFoco": true
}
```

Commit that file with the text and the **Work** carries its own configuration.

### 6. If something does not work

Nine times out of ten it is one of the first two, and they look like everything
else:

- **The settings appear greyed out, or VSCode says `Unknown Configuration
  Setting`.** The extension is not installed in *this* VSCode. Extensions panel
  → search `Texto` → it must be under *Installed*. Install it (section 1) and
  run `Developer: Reload Window` from the command palette. A folder's
  `settings.json` can name any setting it likes; VSCode only honours the ones
  some installed extension has declared, and ignores the rest in silence.
- **The Chapter is dark even though `texto.tema` is `claro`.** You are almost
  certainly looking at VSCode's normal code editor with a dark VSCode theme, not
  at the Prose editor. Check the tab: reopen it with *Reopen Editor With…* →
  **Editor de escritura** (section 2), and set the folder up as a **Writing
  space** (section 3) so it stays that way.
- **The `.md` file still opens with all the symbols showing.** The editor
  association was not picked up: check that the file is under the folder you
  opened in VSCode, that the path is exactly `.vscode/settings.json` (dot at the
  start, inside the folder), and that the value is spelled
  `texto.editorDeEscritura`.
- **You added `texto.tema` and the file stopped opening as prose.** You replaced
  the contents of `settings.json` instead of adding to it, and the
  `workbench.editorAssociations` block is gone. See 5.3 for the whole file.
- **`Texto: Alternar modo foco` does not appear in the palette.** Same cause as
  the first entry: the extension is not installed or the window predates the
  install.
- **VSCode underlines your `settings.json` in red.** JSON punctuation: a missing
  comma between two entries, or a trailing comma after the last one. Hover the
  underline and VSCode names the problem.
- **The theme did not change.** Only `claro` / `oscuro` / `vscode` are accepted;
  anything else falls back to `claro`.

---

## Development

```sh
npm install
npm run build        # bundles the extension and the webview into dist/
npm run watch        # same, in watch mode
npm run typecheck    # tsc --noEmit over the whole project
```

To try it in a real VSCode without installing anything: open this folder and
press `F5` (*Run and Debug → Run Extension*). A second VSCode window opens with
the extension loaded from source.

## Tests

```sh
npm run test:unit         # vitest — the pure logic in src/domain
npm run test:integration  # @vscode/test-electron — a real VSCode, end to end
npm test                  # both
```

The first `test:integration` run downloads a copy of VSCode into `.vscode-test/`
(not distributed, only used to run the tests).

## Layout

See *Conventions* in `docs/ARCHITECTURE.md`.

## License

MIT — see [LICENSE](LICENSE).
