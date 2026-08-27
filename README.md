# Texto

**A minimalist writing editor for markdown, inside VSCode.** Hidden syntax,
book typography, no distractions — and your text stays a plain `.md` file in
your own git repository.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-0098FF)](https://marketplace.visualstudio.com/items?itemName=asiermarques.texto)
[![Open VSX](https://img.shields.io/open-vsx/v/asiermarques/texto?label=Open%20VSX)](https://open-vsx.org/extension/asiermarques/texto)
[![Downloads](https://img.shields.io/open-vsx/dt/asiermarques/texto?label=downloads)](https://open-vsx.org/extension/asiermarques/texto)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Open a `.md` file with Texto and the `#`, the `*` and the `---` step out of
the way: what you see is the prose, set on a page, in a column the width of a
book's. Put the cursor on a word and its markup comes back, ready to edit.
Nothing is converted, exported or rewritten — the file on disk is always
exactly what you typed.

Written for novels, essays, reports, documentation and notes alike.

## Why you might want it

- **Markdown that reads as prose.** Headings, emphasis, quotes, lists,
  tasks, links, footnotes and code compose as what they mean; the syntax is
  revealed only where the cursor is.
- **Typography that holds a long session.** A serif face, a measure that
  grows with the text size, optional justification with hyphenation, and
  `⁂` for a scene break.
- **Focus mode.** Everything dims except the paragraph you are in.
- **Its own theme.** Paper-light or dark, independent of VSCode's — or
  following it, if you prefer.
- **Word count that counts words.** Prose only: `##`, `*` and `---` are not
  words, so the number matches what a word processor would tell you.
- **Tables you never align by hand.** They compose as a grid, and the editor
  keeps the markdown padded *in the file* as you type, so the `.md` reads in
  a diff and on GitHub.
- **Mermaid diagrams, drawn in place.** Flowcharts, sequence, class, state,
  ER and XY charts — from the source in your file, which is all that is ever
  saved.
- **Your text is yours.** Plain `.md`, git for history, no proprietary
  format, no export step, no server, no network request, no telemetry.
- **In English and Spanish**, following VSCode's own display language.

## Getting started

1. **Install it** from the [VS Code
   Marketplace](https://marketplace.visualstudio.com/items?itemName=asiermarques.texto)
   or [Open VSX](https://open-vsx.org/extension/asiermarques/texto) — search
   `Texto` by `asiermarques` in the Extensions panel.
2. **Open a chapter.** Right-click any `.md` file → **Open with Texto**.
   *Open as markdown* is the way back.
3. **Make a folder a writing space** — `.vscode/settings.json` inside it, so
   every `.md` opens as prose from then on:

   ```json
   {
     "workbench.editorAssociations": {
       "*.md": "texto.editor"
     }
   }
   ```

Write each paragraph as one line and let it wrap; don't hand-wrap at 80
columns, or every line becomes its own paragraph. The full walkthrough,
written for someone who has never edited a settings file, is in
[docs/guide/getting-started.md](docs/guide/getting-started.md).

## Settings

| Setting | Values | Default |
| --- | --- | --- |
| `texto.theme` | `light`, `dark`, `vscode` | `light` |
| `texto.textSize` | 14–28, in pixels | `18` |
| `texto.alignment` | `left`, `right`, `justified` | `left` |
| `texto.focusMode` | on / off | on |

All four are also one click away in the status bar, next to the word count,
along with **Raw markdown** (see the file exactly as it is, in place) and
**Frontmatter** (fold the metadata block away or bring it back). Details, and
the VSCode settings that strip the minimap, breadcrumb and line numbers out
of a writing space, in [docs/guide/settings.md](docs/guide/settings.md).

## What it composes

Headings (both spellings) · strong · emphasis · strikethrough · inline code ·
escapes · scene breaks · blockquotes · lists · tasks · links (inline,
reference, autolink, bare URL) · images as their alt text · code blocks ·
footnotes · reference definitions · frontmatter · tables · mermaid diagrams.

HTML is left exactly as written, and code is quoted rather than highlighted.

- [docs/guide/markdown.md](docs/guide/markdown.md) — every construct, the
  keyboard shortcuts, and the `---` rule that decides between a scene break
  and a heading.
- [docs/guide/tables.md](docs/guide/tables.md) — inserting one, `Tab` between
  cells, column alignment, and how the padding in the file works.
- [docs/guide/diagrams.md](docs/guide/diagrams.md) — which diagrams are
  drawn, how they are themed, and why nothing is ever fetched.

## Keyboard

| Shortcut | Does |
| --- | --- |
| `Cmd+B` / `Ctrl+B`, `Cmd+I` / `Ctrl+I` | Strong, emphasis |
| `Cmd+K` / `Ctrl+K` | Link (`Cmd+Alt+K` if VSCode takes `Cmd+K` first) |
| `Cmd+Alt+T` / `Ctrl+Alt+T` | Insert a table; `Tab` moves between cells |
| `Cmd+=` / `Cmd+-` / `Cmd+0` | Text size up, down, back to default |
| `Enter` in a list, task or quote | Continues it; on an empty item, leaves it |

## Documentation

| | |
| --- | --- |
| [Getting started](docs/guide/getting-started.md) | Install, first chapter, writing space |
| [Settings](docs/guide/settings.md) | Every option, the status bar, the workbench |
| [Markdown](docs/guide/markdown.md) · [Tables](docs/guide/tables.md) · [Diagrams](docs/guide/diagrams.md) | What the editor composes |
| [Troubleshooting](docs/guide/troubleshooting.md) | When something looks wrong |
| [PRODUCT.md](docs/PRODUCT.md) · [ARCHITECTURE.md](docs/ARCHITECTURE.md) | The why and the how |

## Development

```sh
npm install
npm run build      # bundles the extension and the webview into dist/
npm test           # unit, performance and integration suites
```

Press `F5` (*Run and Debug → Run Extension*) to try it from source in a
second VSCode window. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) has the
rest — watch mode, the performance baseline, running one integration file —
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the shape of the
code.

## License

MIT — see [LICENSE](LICENSE).
