# Tables

A **Table** is a GFM table: a **Header row**, a **Delimiter row** and its
body **Rows**. It composes as a grid — columns aligned, pipes hidden, the
header set apart by a rule — and it is the one construct this editor writes
bytes for, keeping your markdown aligned in the file as you type.

For the rest of the markdown this editor composes, see
[MARKDOWN.md](markdown.md).

## Writing one

```markdown
| Name  | Role      |
|-------|-----------|
| Ana   | Narrator  |
| Bruno | Bookbinder|
```

`Cmd+Alt+T` / `Ctrl+Alt+T` — or *Texto: Insert table* in the palette —
starts an empty one at the cursor:

```markdown
|   |   |
|---|---|
|   |   |
```

Two columns, one empty body **Row**, already aligned, and the cursor in the
first **Cell**. No placeholder text: the `.md` is your prose, and words the
editor invented would be words you had to delete. A **Table** is a block, so
the skeleton never lands inside the **Paragraph** you were in — it opens a
line of its own below it.

## Moving around

| Key | Does |
| --- | --- |
| `Tab` | Next **Cell**, wrapping to the first **Cell** of the next **Row** |
| `Shift+Tab` | Previous **Cell**, wrapping backwards the same way |
| `Tab` in the last **Cell** of the last **Row** | Adds a **Row**, aligned to the columns you already have, cursor in its first **Cell** |

The **Delimiter row** is not a stop — nothing in it is your text. A cursor
sitting on it counts as sitting between the **Header row** and the body, so
`Tab` from there lands in the first **Cell** of the body.

Outside a **Table**, `Tab` does whatever it did before.

## How it composes

Put the cursor anywhere inside and the **whole** **Table** turns back into
markdown — not just the **Row** you are on. A **Row**'s pipes are only
readable next to the other **Rows**'; revealing one line at a time would
show you a **Table** that never lines up.

With the cursor away:

- Pipes and the **Delimiter row** are gone — the delimiter's line box too,
  since it is pure markup with nothing left to show.
- Columns are set to one width across every **Row**, so the rules run
  unbroken and the header is separated from the body by a single line.
- A **Cell**'s prose wraps inside its column rather than pushing the
  **Table** into the margins. The measure wins: a wide **Table** wraps, it
  does not bleed.
- A very long unbroken word — a URL, a hash, a path — breaks like prose
  instead of widening its column past what the page can hold.

### Column alignment

The markers in the **Delimiter row** work, and they are the column's own —
they override the **Chapter**'s **Text alignment**:

| Written | Column reads |
| --- | --- |
| `:---` or `---` | Left (the default) |
| `---:` | Right |
| `:---:` | Centred |

A right-aligned column is where numbers live, so its figures are set lining
and tabular — one width each — against the oldstyle figures of the prose.
That is the whole reason to right-align a column in the first place.

## The Padded source

While you type inside a **Table**, the editor keeps that **Table**'s columns
padded **in the file**: every column widened to its widest **Cell**, a
leading and trailing pipe on every **Row**, and the **Delimiter row**'s
dashes filling the same widths — the form Prettier, VSCode's own markdown
formatter and GitHub's editor all produce. Your `.md` stays readable in a
diff and on GitHub without you ever lining it up by hand, and since the raw
markdown is exactly what you are looking at under the cursor, you watch it
happen.

What it guarantees:

- **Only spaces are ever added or removed.** Your **Cells**' contents, the
  number of **Rows** and columns, and the alignment markers are never
  touched. A **Cell**'s content is always left where it sits in the line,
  whatever the alignment markers say — the markers move the composed grid,
  not the bytes.
- **One undo takes back both** what you typed and the padding it caused: the
  padding travels in the same transaction as the keystroke, so undo never
  leaves a half-aligned **Table** behind.
- **Nothing is padded on open or on save.** A **Table** you never put the
  cursor in is left exactly as you found it — including a hand-written one
  with ragged pipes, which composes perfectly well as it is.

This is the single place where the editor writes bytes you did not type.
Every other construct keeps the rule that nothing reaches the `.md` without
an explicit action of yours.

## Notes

- Only inline material fits in a **Cell** — that is GFM's own limit, not
  this editor's. A **Cell** is never more than a line's worth.
- A **Table** needs its **Delimiter row** to be a **Table** at all. Until
  you have typed it, what you have is a **Paragraph** with pipes in it, and
  it composes as one.
- Escape a literal pipe inside a **Cell** as `\|`, as in any GFM table.

## Why it is built this way

A **Table**'s grid is decoration and CSS over the characters you typed —
there is no widget, no rendered copy of your **Table** anywhere. The
reasoning is in
[adr/0003-tables-compose-without-a-widget.md](../adr/0003-tables-compose-without-a-widget.md);
the vocabulary (**Row**, **Cell**, **Header row**, **Delimiter row**,
**Padded source**, **Column alignment**) is fixed in
[UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md).
