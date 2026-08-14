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
| **Work** | The complete piece of fiction being written: a novel, a long story, a collection. | Obra | Work | Project, book, manuscript |
| **Chapter** | Unit of organisation of the **Work**, and the contents of one markdown file. | Capítulo | Chapter | Document, file |
| **Scene** | Continuous stretch of action inside a **Chapter**, delimited by **Scene breaks**. | Escena | Scene | Section, block, part |
| **Scene break** | Mark separating two **Scenes** in the same **Chapter**; a horizontal rule in markdown. | Corte de escena | Scene break | Separator, divider |
| **Paragraph** | A run of prose inside a **Scene**: exactly one line of the markdown file, however many lines it takes on screen. | Párrafo | Paragraph | Line, row (a **Paragraph** is not a line of the file wrapped by hand) |
| **Draft** | Complete state of the **Work** at a given moment, as it was saved. | Borrador | Draft | Version, commit, revision |
| **Draft history** | Ordered sequence of the **Drafts** of a **Work**, browsable and comparable. | Historial de borradores | Draft history | Git history, log, version control |

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
| **Writing space** | Directory configured so its markdown files open in the **Writing editor**. | Espacio de escritura | Writing space | Workspace, novel repo |
| **Interface language** | The language the **Writing editor**'s own strings — settings, commands, menus, the status bar toolbar and the **Word count** — are presented in. Follows VSCode's own display language: Spanish when it is Spanish (any region, `es`/`es-ES`/`es-419`…), English otherwise. | — | — | A `texto.*` preference (BR-001: it is not resolvable per **Writing space** the way preferences are); the language of the **Work**, which this never touches (`<html lang>` stays `es`, independent of this) |

## People

| Term | Definition | UI wording (ES) | UI wording (EN) | Avoid |
| --- | --- | --- | --- | --- |
| **Author** | The person writing the **Work**, and the only intended user of this product. | Autor | Author | User, writer, customer |

## Relations

- A **Work** is made of one or more **Chapters**.
- A **Chapter** holds one or more **Scenes**, separated by **Scene breaks**.
- A **Scene** is made of **Paragraphs**, one per line of the file (PD-005).
- Each **Chapter** is a markdown file inside a **Writing space**.
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
- **"Writing surface" and "Writing editor" are not interchangeable.** The editor
  is the component VSCode opens; the surface is what is seen and felt inside it.
  The product's value is in the second, the integration work in the first.
