# Troubleshooting

Nothing here is an error VSCode reports: every one of these is silent, which
is exactly why it is worth a list. The sections referred to throughout live in
[getting-started.md](getting-started.md) and [settings.md](settings.md).

## The usual suspects

Nine times out of ten it's one of the first two:

- **Settings greyed out, or `Unknown Configuration Setting`.** Not installed
  in *this* VSCode. Extensions panel → search `Texto` → must be under
  *Installed*. Install it ([Install the
  extension](getting-started.md#install-the-extension)), then `Developer:
  Reload Window`. VSCode only honours settings some installed extension
  declared, and ignores the rest in silence.
- **The Chapter is a different colour than `texto.theme` says.** You're
  looking at VSCode's normal code editor, not the Writing editor. Reopen it
  with *Reopen Editor With…* → **Texto: Writing editor** ([Open a
  Chapter](getting-started.md#open-a-chapter-in-the-writing-editor)), then set
  up the folder as a **Writing space** ([Writing
  space](getting-started.md#make-a-folder-a-writing-space)) so it stays that
  way.
- **The `.md` still opens with symbols showing.** The association wasn't
  picked up: check the file is under the folder VSCode opened, the path is
  exactly `.vscode/settings.json`, and the value is `texto.editor` — if it's
  `texto.editorDeEscritura`, see [Upgrading a Writing
  space](#upgrading-a-writing-space-built-before-the-english-rename).
- **A `texto.*` setting stopped the file opening as prose.** You replaced
  `settings.json`'s contents instead of adding to it, dropping the
  `workbench.editorAssociations` block. [The whole
  file](settings.md#the-whole-file) has every line it needs.
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
  missing [VSCode's
  navigation](settings.md#turning-off-vscodes-navigation-for-a-writing-space)'s
  settings, or the file is outside it — both are workspace-scoped, like the
  association in [Make a folder a Writing
  space](getting-started.md#make-a-folder-a-writing-space).

## Upgrading a Writing space built before the English rename

Every `texto.*` key and value, and the Writing editor's `viewType`, used to be
Spanish (`texto.tema`, `texto.modoFoco`, `claro`/`oscuro`,
`izquierda`/`derecha`/`justificado`, `texto.editorDeEscritura`). The rename is
breaking on purpose, no alias — a **Writing space** built against the old
names keeps its `.vscode/settings.json` untouched, silently, until you edit it
by hand. Two symptoms tell you it needs updating:

- **A Chapter opens in VSCode's plain markdown editor instead of the Writing
  editor.** `workbench.editorAssociations` still points at
  `texto.editorDeEscritura`. Fix: replace it with `texto.editor` ([the Writing
  space snippet](getting-started.md#make-a-folder-a-writing-space)).
  Meanwhile, reach the Writing editor with **Open with Texto** ([Open a
  Chapter](getting-started.md#open-a-chapter-in-the-writing-editor)).
- **A Chapter opens in the Writing editor with the factory look, ignoring the
  folder's settings.** The old keys (`texto.tema`, `texto.modoFoco`,
  `texto.tamanoDeTexto`, `texto.alineacion`) go unrecognised, so it falls back
  to defaults, quietly. Fix: rename each to its English form (`texto.theme`,
  `texto.focusMode`, `texto.textSize`, `texto.alignment`) and its value where
  it's an enum (`claro`→`light`, `oscuro`→`dark`, `izquierda`→`left`,
  `derecha`→`right`, `justificado`→`justified`; `vscode` is unchanged). [The
  whole file](settings.md#the-whole-file) has the complete file to copy from.

Neither symptom raises an error — the accepted cost of the rename, not a bug
to report.
