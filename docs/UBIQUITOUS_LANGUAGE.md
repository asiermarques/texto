# Ubiquitous Language

Canonical vocabulary. These terms are the ones to use in code, in documents and
in conversation. Aliases listed here were rejected on purpose.

The extension's interface ships in two languages, Spanish and English,
following VSCode's own display language — see **Interface language**, below.
English is the fallback: for any display language that is not Spanish, and for
any string with no Spanish translation yet. Where a term reaches a
user-facing surface, its "UI wording" columns are the exact strings that
ship, one per language, fixed here so every later change copies a wording
instead of inventing one. Identifiers — setting keys, enum values, the
**Writing editor**'s `viewType` — are never translated; only the text
describing them changes with the language.

## The work

| Term | Definition | UI wording (ES) | UI wording (EN) | Avoid |
| --- | --- | --- | --- | --- |
| **Work** | The complete piece being written: a novel, a long story, a collection — or, since requirement 006, an essay, a report, a set of notes, documentation. | Obra | Work | Project, book, manuscript |
| **Chapter** | Unit of organisation of the **Work**, and the contents of one markdown file: a chapter in fiction, a section or an article in non-fiction. | Capítulo | Chapter | Document, file |
| **Scene** | Continuous stretch inside a **Chapter**, delimited by **Scene breaks**: a shift of action in fiction, of section in non-fiction. | Escena | Scene | Section, block, part |
| **Scene break** | Mark separating two **Scenes** in the same **Chapter**; a horizontal rule in markdown. | Corte de escena | Scene break | Separator, divider |
| **Paragraph** | A run of prose inside a **Scene**: exactly one line of the markdown file, however many lines it takes on screen. | Párrafo | Paragraph | Line (a **Paragraph** is not a line of the file wrapped by hand); **Row**, which is a line of a **Table** and never a **Paragraph** |
| **Draft** | Complete state of the **Work** at a given moment, as it was saved. | Borrador | Draft | Version, commit, revision |
| **Draft history** | Ordered sequence of the **Drafts** of a **Work**, browsable and comparable. | Historial de borradores | Draft history | Git history, log, version control |

## Material

What a **Chapter** is made of, beyond the **Paragraph** — the vocabulary
requirement 006 adds so non-fiction has the same canonical names fiction
already had, and requirement 009 completes with the **Table**, the last
construct 006 left out of the **Composed subset**.

| Term | Definition | UI wording (ES) | UI wording (EN) | Avoid |
| --- | --- | --- | --- | --- |
| **Link** | Text pointing at a target — inline (`[text](url)`), reference (`[text][ref]`), autolink (`<url>`) or a bare URL — composed as its text with the target hidden. | Enlace | Link | Hyperlink, URL (the URL is the target, not the **Link**) |
| **Image** | `![alt](url)`, composed as its alternative text and marked as an **Image** rather than a **Link**; never rendered as a picture (NOGOAL-002). | Imagen | Image | Picture, figure |
| **Inline code** | A fragment between backticks, composed monospaced inside a **Paragraph**, its backticks hidden. | Código en línea | Inline code | Code span, backtick |
| **Code block** | A fenced or indented block of code, composed as preformatted text in a single colour, set apart from prose. | Bloque de código | Code block | Snippet, code fence |
| **Task** | A list item marked `[ ]` or `[x]`, composed as a box built from those same characters. | Tarea | Task | Checkbox, to-do |
| **Task list** | A list made entirely of **Tasks**. | Lista de tareas | Task list | Checklist, to-do list |
| **Footnote** | A call in the text (`[^1]`) composed as a superscript, and its definition, composed apart from prose at the foot of the **Chapter**. | Nota al pie | Footnote | Note, endnote |
| **Reference definition** | The line elsewhere in the **Chapter** that gives a reference **Link** its target; composed as a discreet block, not as prose. | Definición de referencia | Reference definition | Link reference, footnote (it is not a **Footnote**, even though both sit apart from prose) |
| **Strikethrough** | `~~text~~`, composed struck through, its tildes hidden. | Tachado | Strikethrough | Strike, deleted text |
| **Table** | A GFM table: a **Header row**, a **Delimiter row** and its body **Rows**. Composed as a grid — columns aligned, pipes hidden — and revealed whole, never Row by Row, while the selection is inside it (requirement 009). | Tabla | Table | Grid, spreadsheet, matrix |
| **Row** | One line of a **Table**, holding one **Cell** per column. One **Row**, one line of the file, the same grain PD-005 gives a **Paragraph**. | Fila | Row | Record, line (a **Row** is a line of a **Table**, never a **Paragraph**) |
| **Header row** | A **Table**'s first **Row**, naming its columns; composed heavier than the body and separated from it by a rule. | Fila de cabecera | Header row | Title row, heading (it is not a **Heading**), th |
| **Delimiter row** | The `\|---\|:--:\|` line between a **Table**'s **Header row** and its body, carrying the **Column alignment**. Pure markup: composed away entirely, text and line box both. | Fila delimitadora | Delimiter row | Separator row, divider (a **Scene break** is the divider), dashes |
| **Cell** | One **Table** column's content within one **Row**: inline material only, never more than a line's worth. | Celda | Cell | Field, column (a column is every **Cell** at one position, across the **Rows**), box |
| **Column alignment** | Which way a **Table** column's **Cells** are set — left (the default), right or centred — written in the **Delimiter row** as `:---`, `---:` or `:---:`. It is the column's own, and overrides the **Chapter**'s **Text alignment**. | Alineación de columna | Column alignment | Justificación, **Text alignment** (that one is the whole **Chapter**'s) |
| **Composed subset** | The markdown constructs the **Live preview** composes — the rest is shown exactly as written (BR-002 of 001). | Subconjunto compuesto | Composed subset | The FR-002 subset (an internal requirement-tracking name, not a term to write in code or comments), rendered subset |

## The editor

| Term | Definition | UI wording (ES) | UI wording (EN) | Avoid |
| --- | --- | --- | --- | --- |
| **Writing editor** | The custom editor that opens markdown files for writing prose, as opposed to VSCode's code editor. | Texto: Editor de escritura | Texto: Writing editor | Custom editor, pretty editor, "Prose editor" (an earlier internal name; the domain concept, not the string shown to the reader) |
| **Writing surface** | What the **Author** sees and touches while writing: typography, measure, cursor and text behaviour. | — | — | Interface, UI, view |
| **Live preview** | Presentation mode where markdown syntax is hidden and styling applied while typing, revealed only around the cursor. | Live preview | Live preview | Preview, WYSIWYG, render |
| **Focus mode** | Mode where everything except the block holding the cursor is dimmed by opacity. | Modo foco | Focus mode | Zen mode, distraction-free mode |
| **Editor theme** | The **Writing editor**'s own colour palette — Light (default), Dark, or following VSCode's active theme. | Tema del editor | Editor theme | Modo claro, modo oscuro, dark mode |
| **Text size** | The size of the **Chapter**'s body text inside the **Writing editor**; the column's measure scales with it. | Tamaño de texto | Text size | Zoom, fuente, font size |
| **Text alignment** | Whether the **Chapter**'s body is left-aligned (default), right-aligned, or justified with hyphenation. | Alineación | Text alignment | Justificación/Justified (as the setting's name — it is one of its three values) |
| **Word count** | The number of prose words in the open **Chapter**, and in the current selection — markdown syntax does not count. | Palabras | Word count | Caracteres, longitud, contador |
| **Raw markdown view** | Panel-local state that shows a **Chapter**'s markdown syntax in place, with **Live preview** and **Focus mode**'s dimming off; not persisted. | Ver markdown | Raw markdown | Modo código, fuente, source |
| **Running version** | The version of the Texto extension the **Author** currently has installed and running, read from the manifest at activation — the first thing any bug report needs. | Texto {versión} | Texto {version} | Build, release, revisión, número de versión |
| **Writing space** | Directory configured so its markdown files open in the **Writing editor**. | Espacio de escritura | Writing space | Workspace, novel repo |
| **Interface language** | The language the **Writing editor**'s own strings — settings, commands, menus, the status bar toolbar and the **Word count** — are presented in. Follows VSCode's own display language: Spanish when it is Spanish (any region, `es`/`es-ES`/`es-419`…), English otherwise. | — | — | A `texto.*` preference (BR-001: it is not resolvable per **Writing space** the way preferences are); the language of the **Work**, which this never touches (`<html lang>` stays `es`, independent of this) |

## Quality tooling

Vocabulary for the project's own build and test tooling — never surfaced to
the **Author** as a **Writing editor** user, so these carry no UI wording.

| Term | Definition | UI wording (ES) | UI wording (EN) | Avoid |
| --- | --- | --- | --- | --- |
| **Operation count** | A deterministic count — full markdown parses, **Tree update**s, **Live preview** instructions, **Focus mode** dim ranges, built-bundle bytes — compared for exact equality against a baseline committed to the repository, on every commit (requirement 007). | — | — | Work counter (collides with **Work**), benchmark, metric (too generic once **Operation count** is the specific term) |
| **Tree update** | One of the **Operation count** metrics (requirement 008): a reparse that reused a previous parse's unaffected parts (`TreeFragment.applyChanges`) instead of parsing the whole **Chapter** again. The healthy value is exactly one per keystroke and zero per cursor move — a full parse appearing on either path (the metric beside it in the baseline) is the regression this pair of counts exists to catch. | — | — | Incremental parse (describes the mechanism, not the counted quantity), reparse |

## People

| Term | Definition | UI wording (ES) | UI wording (EN) | Avoid |
| --- | --- | --- | --- | --- |
| **Author** | The person writing the **Work**, and the only intended user of this product. | Autor | Author | User, writer, customer |

## Relations

- A **Work** is made of one or more **Chapters**.
- A **Chapter** holds one or more **Scenes**, separated by **Scene breaks**.
- A **Scene** is made of **Paragraphs**, one per line of the file (PD-005).
- Each **Chapter** is a markdown file inside a **Writing space**.
- A **Table** is made of **Rows**, each one line of the file; a **Row** is made
  of **Cells**, one per column.
- The **Writing editor** presents a **Chapter** through a **Writing surface**.

## Pitfalls

- **"Focus mode" was used for three different things.** **Focus mode** is
  dimming what does not hold the cursor. *Typewriter mode* (keeping the active
  line centred) is a different thing and is rejected. *Distraction-free*
  describes hiding VSCode's chrome, which is environment configuration, not an
  editor mode. Not synonyms.
- **"Document" collides with VSCode.** `TextDocument` is VSCode's data model and
  appears in the code. For what the **Author** writes, say **Chapter** or
  **Scene**.
- **"User" is overloaded.** VSCode has *user settings*. For the person writing,
  the term is **Author**.
- **"Sync" means nothing in this product.** Both meanings it once had (a
  commit + push flow, and CRDT merging) were dropped along with multi-device
  support. What exists is **Draft history**.
- **Two things are called alignment, and they are not the same.** **Text
  alignment** is the whole **Chapter**'s (`texto.alignment`: left, right,
  justified). **Column alignment** is one **Table** column's, written into the
  **Delimiter row** by the **Author** and always winning over the **Chapter**'s
  — a justified **Work** does not justify a **Cell**.
- **"Writing surface" and "Writing editor" are not interchangeable.** The editor
  is the component VSCode opens; the surface is what is seen and felt inside it.
  The product's value is in the second, the integration work in the first.
- **Fiction is no longer the only shape a Work takes (requirement 006).** No
  user-facing string, comment or document may assume the **Work** being written
  is a novel — an essay, a set of notes or documentation are just as much a
  **Work**, made of the same **Chapters** and **Scenes**.
