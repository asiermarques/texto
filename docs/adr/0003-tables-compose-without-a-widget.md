---
title: A Table composes as decorations over the Author's own text, laid out per Cell
status: Proposed
date: 2026-08-21
tags: [live-preview, composed-subset, tables]
---

# 0003. A Table composes as decorations over the Author's own text, laid out per Cell

## Context and problem statement

Requirement 006 put every construct non-fiction needs into the **Composed
subset** — **Links**, **Inline code**, **Code blocks**, **Tasks**,
**Footnotes** — and deliberately left one out:

> NOGOAL-001 — Tables. They keep the treatment BR-002 of 001 gives them: plain
> text, intact on disk, no decoration. Composing a table means aligning columns
> the file does not align, which is the one construct that cannot be expressed
> as hide/mark/line over the **Author**'s own characters.

`docs/ARCHITECTURE.md` recorded the matching architectural rule — "Every
composition is a decoration plus CSS — never a widget" — naming "a table grid"
as an example of what that ruled out.

Requirement 009 reverses the product half of that: the **Author** asked for
**Tables** to be composed, and authorised an exception to the never-a-widget
rule for them (BR-002 of 009) precisely because NOGOAL-001's reasoning
suggested nothing else could work.

The question this ADR settles is whether that exception had to be spent.

## Decision drivers

- **RISK-003 of 009.** Whatever draws the grid, selection, copy, the cursor and
  CodeMirror's own hit-test must keep behaving as they do over text. A grid the
  **Author** cannot click into fails GOAL-001 whatever it looks like.
- **PD-005.** One **Row**, one line of the file. The composition may not need
  the file to be shaped differently from how a **Work** is written.
- **OQ-001, answered by the Author.** A **Table** wider than the measure wraps
  inside it: it never bleeds into the margins and never scrolls.
- **PD-008.** Whatever is chosen is counted per commit. A mechanism that needs
  to measure the DOM on every keystroke is a different cost class from one that
  computes a value from the parse tree.

## Considered options

1. **A block widget** — replace the whole **Table** with a rendered `<table>`.
2. **`display: table-row` on the Rows' lines**, letting CSS's anonymous table
   boxes wrap the consecutive lines into one table and lay the columns out.
3. **`display: grid` on each Row's line**, with the column tracks shared by
   every Row of the same **Table**.
4. **Layout on the Cell**: every **Cell** of a column gets the same share of
   the measure, in every **Row**.

## Decision outcome

**Option 4.** Every **Cell** is an inline-block carrying a `width` that is its
column's share of the measure, computed once per **Table** by
`src/domain/livePreview.ts` from the widest **Cell** in each column and stamped
on the **Cell**'s own `mark` decoration.

**The widget exception was not needed and has not been spent.** A composed
**Table** is still nothing but `hide`, `mark` and `line` over the characters the
**Author** typed — which means NOGOAL-002 of 006 stands unchanged for every
other construct, and stands for **Tables** too in practice.

Options 2 and 3 were both implemented and both measured against a real
**Writing surface** before being discarded. They are recorded here because both
look obviously correct on paper:

- **Option 2 fails because Chromium builds one anonymous table per line.**
  Consecutive `display: table-row` siblings are supposed to be wrapped in a
  single anonymous table box. Measured in the webview, each `.cm-line` got its
  own: the three **Rows** of a two-column fixture came out 72/59, 54/74 and
  83/112 pixels wide — every **Row** sized its columns to its own content, and
  nothing lined up. The `display: none` **Delimiter row** between the **Header
  row** and the body is not the cause; two adjacent body **Rows** diverged the
  same way.
- **Option 3 fails because a Cell is not reliably a child of its Row.**
  CodeMirror renders a `cm-widgetBuffer` element around every hidden range, and
  **Focus mode** wraps a dimmed line's content in a span of its own. The line's
  children are therefore a mixture of buffers, empty replacement spans and —
  sometimes nested one level down — the **Cells**. Grid items are assigned to
  tracks by child order, so the **Cells** landed in arbitrary columns.

Both failures share one cause: **the Rows cannot be laid out together**, because
to the browser they are unrelated line boxes whose internal structure CodeMirror
owns. Only the **Cell** itself can carry the layout, which is what option 4 does.

### Why shares of the measure rather than character widths

A **Cell** is set in the **Chapter**'s own proportional type (ASM-001 of 009), so
a character count is a decent *ratio* and a poor *width*: asking for `7ch` leaves
some columns overflowing and others padded. A percentage of the measure cannot
exceed the measure, which is also how OQ-001's answer is honoured for free — a
wide **Table** wraps its **Cells** and grows taller. A floor of three characters
on the ratio keeps a column of `#` beside a column of prose from collapsing to
less than one character.

### Consequences

- Columns are proportional to their content rather than sized exactly to it. A
  **Table** always spans the measure.
- The **Author** can click into a composed **Cell**, select across **Rows** and
  copy real markdown, because it is all still text (RISK-003, covered by
  `test/integration/livePreviewTables.test.ts`).
- `LivePreviewInstruction`'s `mark` gains an optional `attributes` bag, the same
  precedent `title` set: a value the stylesheet cannot know in advance, carried
  on the decoration rather than encoded as a class.
- No measurement of the DOM, on any path. The share is a pure function of the
  parse tree, computed in the same traversal as everything else — the only
  metric that moved in `test/performance/baseline.json` is the webview bundle's
  size.
- `docs/ARCHITECTURE.md`'s composition bullet keeps its rule and loses its
  example: a table grid is no longer what "never a widget" rules out.
