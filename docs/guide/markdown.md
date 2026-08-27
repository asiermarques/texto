# Writing in markdown

How a **Chapter** is written, and what the **Writing editor** does with it.

The file on disk is markdown and nothing else: what you type is what is
saved, byte for byte, and any other editor — VSCode's own, `cat`, GitHub —
reads the same file. The **Writing editor** does not convert, export or
rewrite anything. It composes: the syntax you wrote is hidden while the
cursor is elsewhere, and revealed the moment the cursor touches the text it
marks, so a **Chapter** reads as prose while you write prose and as markdown
while you edit markup.

One construct writes bytes on your behalf — a **Table**'s alignment, and
only while you are typing inside it. That single exception is explained in
[TABLES.md](tables.md).

- **Tables** have their own guide: [TABLES.md](tables.md).
- **Diagrams** (```` ```mermaid ````) have their own guide:
  [DIAGRAMS.md](diagrams.md).
- The vocabulary used throughout — **Chapter**, **Scene break**, **Composed
  subset**… — is defined in [UBIQUITOUS_LANGUAGE.md](../UBIQUITOUS_LANGUAGE.md).

## The rule

Everything in the **Composed subset** below follows the same rule:

1. **On disk it is plain markdown.** Nothing is inserted, normalised or
   pretty-printed on open or on save.
2. **Composed while the cursor is away.** The markers are hidden and the
   text is set the way the markers describe.
3. **Revealed while the cursor is inside.** The markers come back as
   characters you can edit, exactly as you typed them.

Two constructs are revealed *whole* rather than character by character, for
the same reason in both cases — the parts only make sense together: a
**Table** (a **Row**'s pipes are only readable next to the other **Rows**')
and a **Diagram** (a picture has no "the bit under the cursor").

The **Raw markdown** button in the status bar — or *Texto: Raw markdown* in
the palette — turns composition off for the whole **Chapter** while you look
at it. It is panel state, not a setting: a **Chapter** always opens composed.

## The Composed subset

| Construct | Written as | Reads as |
| --- | --- | --- |
| Heading | `## Title`, or `Title` over `====` / `----` (setext) | Sized, weighted title |
| Strong / emphasis | `**text**` / `*text*` | Bold / italic |
| Strikethrough | `~~text~~` | Struck through |
| Inline code | `` `code` `` | Monospaced, on a discreet ground |
| Escape | `\*` | The literal character, the backslash hidden |
| Scene break | `---` on its own, blank line above | Centred `⁂` |
| Blockquote | `> text` | Indented, with a left rail |
| List | `- item` / `1. item` | A bullet or a number, indented by nesting depth |
| Task | `- [ ] item` / `- [x] item` | A clickable box, empty or ticked |
| Link | `[text](url)`, `[text][ref]`, `<url>`, a bare `https://…` | Underlined text, the target hidden |
| Image | `![alt](url)` | Its alternative text, marked apart from a Link |
| Code block | ` ```lang … ``` ` or a 4-space indent | Preformatted, monospaced, never justified |
| Diagram | ` ```mermaid … ``` ` | The picture the source describes — [DIAGRAMS.md](diagrams.md) |
| Table | `\| Name \| Role \|` over `\| --- \| --- \|` | An aligned grid — [TABLES.md](tables.md) |
| Footnote | `text[^1]` … `[^1]: note` | The call as a superscript, the note apart from the prose |
| Reference definition | `[ref]: url` | A discreet line, apart from the prose |
| Frontmatter | `---`-fenced YAML or `+++`-fenced TOML, at the very top | Folded out of sight |

### Headings

Both markdown spellings compose: ATX (`## Title`) and setext (a line of text
with `====` or `----` under it). The hashes and the underline are hidden;
the title keeps its level's size and weight.

### Scene breaks, and the `---` rule

`---` means two different things, and only the line above decides which:

```markdown
A paragraph that ends here.
---
```

Directly under prose, with **no** blank line between them, `---` is a setext
heading: CommonMark reads the line above as an H2, and so does this editor.

```markdown
A paragraph that ends here.

---

The next Scene.
```

With a blank line above it, `---` is a **Scene break**, composed as a
centred `⁂`. Write **Scene breaks** the second way and nothing is ambiguous.

### Lists and Tasks

`Enter` inside a list item, a **Task** or a blockquote continues it: the
next bullet, the next number, an empty (unchecked) box, another `>`. On an
*empty* item, `Enter` removes the marker instead and leaves the block —
which is how you end a list without deleting anything by hand.

A **Task** is a list item written `- [ ]` or `- [x]`. Its box is composed
from those characters, and clicking it rewrites them in the file. Nesting
composes by depth, indenting the bullet with it.

### Links and Images

Four spellings compose, all of them into "the text, underlined, target
hidden": inline `[text](url)`, reference `[text][ref]`, autolink `<url>`,
and a bare `https://…` in the prose. Hover, or put the cursor in, to see the
target; `Cmd`/`Ctrl`+click to follow it — VSCode's own link handling opens
it, and the **Writing editor** never navigates on its own.

An **Image** (`![alt](url)`) composes as its alternative text, marked
distinctly from a **Link**. The picture itself is never drawn: this is an
editor for prose, and a **Diagram** is the one thing on the page that is
drawn rather than styled.

A **Reference definition** (`[ref]: url`) is set apart from the prose as a
discreet line, wherever in the **Chapter** you keep it.

### Code

A **Code block** — fenced or indented by four spaces — is composed
preformatted and monospaced, in a single colour, never justified. There is
no syntax colouring inside it: this editor quotes code, it does not
highlight it. Its contents are not counted by the word count either.

**Inline code** hides its backticks and sets the fragment monospaced on a
discreet ground.

### Footnotes

Two constructs, deliberately simple:

```markdown
The claim itself[^1].

[^1]: Where the claim comes from.
```

The call composes as a superscript; the definition is set apart from the
prose. A definition is one line — a footnote that needs paragraphs is an
endnote, which is out of scope. The call and its label are not counted as
words; the definition's own text is.

### Frontmatter

A `---`-fenced YAML block or a `+++`-fenced TOML block, at the very top of
the file, is folded out of sight — it is metadata, not the **Chapter**.
The **Frontmatter** button in the status bar (or *Texto: Show or fold away
the frontmatter*) brings it back and folds it away again; the button only
appears for a **Chapter** that has one.

## Not composed

Shown and kept exactly as written:

- **HTML**, inline or block.
- **Syntax colouring inside a Code block** — see above.

## From the keyboard

| Shortcut | Does |
| --- | --- |
| `Cmd+B` / `Ctrl+B` | Wraps/unwraps the selection in `**` (strong) |
| `Cmd+I` / `Ctrl+I` | Wraps/unwraps the selection in `*` (emphasis) |
| `Cmd+K` / `Ctrl+K` | Wraps the selection as `[text]()`, cursor left on the target |
| `Cmd+Alt+K` / `Ctrl+Alt+K` | The same — use it if your VSCode swallows `Cmd+K` first as a chord (`Cmd+K Cmd+S`, `Cmd+K V`…) |
| Paste a URL over a selection | Turns the selection into a **Link** with the pasted URL as target; over a **Link**'s text it replaces only the target |
| `Cmd+Alt+T` / `Ctrl+Alt+T` | Inserts an empty **Table** — [TABLES.md](tables.md) |
| `Tab` / `Shift+Tab` inside a **Table** | Moves between **Cells** — [TABLES.md](tables.md) |
| `Enter` in a list item, **Task** or blockquote | Continues it; on an empty item, leaves the block |
| Click a **Task**'s box | Toggles `[ ]` ↔ `[x]` in the file |
| `Cmd`/`Ctrl`+click a **Link** | Opens its target with VSCode's link handling |

`Cmd+B` and `Cmd+I` also work with no selection, at the cursor.

## Why it is written this way

The reasoning behind the subset — why an **Image** is not drawn, why code is
not coloured, why every composition is a decoration over your own characters
— is in [PRODUCT.md](../PRODUCT.md) and [ARCHITECTURE.md](../ARCHITECTURE.md), and
the decisions that shaped **Tables** and **Diagrams** in
[adr/0003-tables-compose-without-a-widget.md](../adr/0003-tables-compose-without-a-widget.md)
and [adr/0004-a-diagram-is-the-one-widget.md](../adr/0004-a-diagram-is-the-one-widget.md).
