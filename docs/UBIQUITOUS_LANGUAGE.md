# Ubiquitous Language

Canonical vocabulary. These terms are the ones to use in code, in documents and
in conversation. Aliases listed here were rejected on purpose.

The extension's user-facing strings are written in Spanish, because the Author
writes in Spanish; the "UI wording" column is the exact string that ships.

## The work

| Term | Definition | UI wording | Avoid |
| --- | --- | --- | --- |
| **Work** | The complete piece of fiction being written: a novel, a long story, a collection. | Obra | Project, book, manuscript |
| **Chapter** | Unit of organisation of the **Work**, and the contents of one markdown file. | Capítulo | Document, file |
| **Scene** | Continuous stretch of action inside a **Chapter**, delimited by **Scene breaks**. | Escena | Section, block, part |
| **Scene break** | Mark separating two **Scenes** in the same **Chapter**; a horizontal rule in markdown. | Corte de escena | Separator, divider |
| **Draft** | Complete state of the **Work** at a given moment, as it was saved. | Borrador | Version, commit, revision |
| **Draft history** | Ordered sequence of the **Drafts** of a **Work**, browsable and comparable. | Historial de borradores | Git history, log, version control |

## The editor

| Term | Definition | UI wording | Avoid |
| --- | --- | --- | --- |
| **Prose editor** | The custom editor that opens markdown files for writing prose, as opposed to VSCode's code editor. | Editor de escritura | Custom editor, pretty editor |
| **Writing surface** | What the **Author** sees and touches while writing: typography, measure, cursor and text behaviour. | — | Interface, UI, view |
| **Live preview** | Presentation mode where markdown syntax is hidden and styling applied while typing, revealed only around the cursor. | Live preview | Preview, WYSIWYG, render |
| **Focus mode** | Mode where everything except the block holding the cursor is dimmed by opacity. | Modo foco | Zen mode, distraction-free mode |
| **Editor theme** | The **Prose editor**'s own colour palette — Claro (default), Oscuro, or following VSCode's active theme. | Tema del editor | Modo claro, modo oscuro, dark mode |
| **Writing space** | Directory configured so its markdown files open in the **Prose editor**. | Espacio de escritura | Workspace, novel repo |

## People

| Term | Definition | UI wording | Avoid |
| --- | --- | --- | --- |
| **Author** | The person writing the **Work**, and the only intended user of this product. | Autor | User, writer, customer |

## Relations

- A **Work** is made of one or more **Chapters**.
- A **Chapter** holds one or more **Scenes**, separated by **Scene breaks**.
- Each **Chapter** is a markdown file inside a **Writing space**.
- The **Prose editor** presents a **Chapter** through a **Writing surface**.

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
- **"Writing surface" and "Prose editor" are not interchangeable.** The editor
  is the component VSCode opens; the surface is what is seen and felt inside it.
  The product's value is in the second, the integration work in the first.
