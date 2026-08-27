---
title: A Diagram is the one widget, and its renderer is a bundle of its own
status: Proposed
date: 2026-08-27
tags: [live-preview, composed-subset, diagrams, bundle-size]
---

# 0004. A Diagram is the one widget, and its renderer is a bundle of its own

## Context and problem statement

Requirement 006 set the rule that has governed the **Composed subset** ever
since, and `docs/ARCHITECTURE.md` recorded it:

> Every composition is a decoration plus CSS — never a widget.

Requirement 009 put that rule under real pressure. Composing a **Table** meant
aligning columns the file does not align, which NOGOAL-001 of 006 had called
"the one construct that cannot be expressed as hide/mark/line over the
**Author**'s own characters"; BR-002 of 009 authorised a widget for it in
advance. ADR 0003 then found the exception was not needed and did not spend
it: a **Table** is still nothing but `hide`, `mark` and `line`.

The **Author** now asks for **Diagrams** — a **Code block** fenced
```` ```mermaid ```` composed as the picture its source describes.

This ADR settles two questions. Whether the exception ADR 0003 preserved has
to be spent here, and what to do about the renderer's size.

## Decision drivers

- **The rule is worth keeping unless it genuinely cannot hold.** ADR 0003
  is the precedent: the construct that "obviously" needed a widget did not.
- **The Writing surface's cost is measured per commit (requirement 007).**
  `webviewBundleBytes` is compared for exact equality on every commit. A
  renderer this size is not a metric movement to re-baseline, it is a
  different product.
- **What the Author writes is what is on disk.** Whatever draws the picture
  may not write anything back into the **Chapter**.
- **A composed Diagram must still be editable.** GOAL-001. The **Author**
  has to be able to get at the source, with the keyboard and with the mouse.

## Considered options

### Whether it can be done without a widget

1. **Decorations plus CSS**, as everything else.
2. **A block `WidgetType`** replacing the **Code block** with a rendered SVG.

### Where the renderer lives

3. **Inside `dist/webview.js`** — one bundle, as today.
4. **A third bundle, `dist/mermaid.js`**, fetched on demand.
5. **In the extension host**, rendering to SVG and posting it to the webview.

## Decision outcome

**Option 2 and option 4.** A **Diagram** is a `WidgetType`, and the renderer
is a separate bundle loaded only by a **Chapter** that contains one.

**The widget exception is spent here, and this is what it was being kept
for.** The reasoning ADR 0003 rejected for a **Table** holds for a
**Diagram**, and holds for a different reason. A **Table**'s grid is *latent
in the text*: the **Cells** are there, in order, and CSS only had to be
allowed to lay them out. A **Diagram**'s picture is not latent in anything. A
box's position is computed by a layout solver from a graph the source
describes; there is no character in the **Chapter** that a decoration could
style into a node, an edge or an arrowhead. `hide`/`mark`/`line` describe what
to do to text that is already on screen, and here none of it is.

`LivePreviewInstruction` gains a `diagram` kind carrying the block's bounds
and its **Diagram source**. The domain still decides *what* composes and
*when* — the webview still owns every DOM object, exactly as before.

### Why a separate bundle

`beautiful-mermaid` bundles to **1.5MB minified**, against the Writing
surface's own ~330KB. 93.7% of that — 1.4MB — is `elkjs`, the graph-layout
solver, imported statically and impossible to tree-shake.

Option 3 would make every **Chapter** parse 1.85MB of JavaScript before its
first line appears: a novel with no diagram in it, on every panel open,
forever. That is not a **Writing surface** this project would ship.

Option 5 is worse still. `dist/extension.js` is loaded at *activation*, not
per panel, so the same 1.5MB would be paid by every VSCode window that
touches a markdown file — and the picture would then have to cross
`postMessage` on every keystroke that changes it.

Option 4 costs one more esbuild context, one `<meta>` tag, and an injected
`<script>`. The URI is advertised in the HTML shell rather than loaded from
it, and `src/webview/mermaidRenderer.ts` fetches it the first time a
**Diagram** actually needs drawing. Measured: `webviewBundleBytes` moved from
326,202 to 329,822 — 3.6KB, the widget and the loader — and the renderer sits
in `mermaidBundleBytes`, a metric of its own so that a future change cannot
quietly fold one into the other.

### Consequences

- **A Diagram reveals whole, like a Table**, and for a stronger reason: its
  source is a program, and a program read half-composed is neither a picture
  nor something the **Author** can edit.
- **A Diagram is not in `atomicRanges`.** Every other replacement there —
  hidden markers, the **Frontmatter** fold — exists to keep the cursor out. A
  **Diagram** must let it in: walking into it with an arrow key is how the
  source comes back. The mouse needs an affordance of its own, since a
  replaced block leaves no text under the pointer to resolve a click to —
  `main.ts`'s click handler places the cursor inside, the same gap US-008 of
  006 had to close for a **Code block**'s hidden fence.
- **`livePreviewPlugin.ts` is now a `StateField` plus a `ViewPlugin`.** Not a
  preference: CodeMirror refuses a decoration that replaces a line break from
  a `ViewPlugin`. Rather than traverse the tree once per provider, the field
  holds the instruction list and the plugin reads it.
- **A Diagram is redrawn on a theme change**, alone among compositions: its
  palette is baked into the SVG at render time, not read from CSS. That is
  what the `redrawDiagrams` effect is for.
- **The SVG's inline `<style>` carries the nonce.** Without it the Content
  Security Policy strips the diagram of every colour, and it draws as
  unstyled shapes — a failure that passes any assertion that merely counts
  elements, which is why the test protocol reports `styleHasNonce`.
- **No Chapter reaches for the network.** `beautiful-mermaid` opens every SVG
  with a Google Fonts `@import`; it is stripped before insertion, and the
  text falls through to the `system-ui` the SVG already names as its
  fallback.
- **A Diagram that cannot be drawn shows its own source**, set as the **Code
  block** it is written as. An unparseable diagram is a thing the **Author**
  is in the middle of writing, not an error to report at them.
- **What is on disk is untouched.** The picture is drawn, never inserted, and
  the **Diagram source** is a **Code block**'s contents as far as the **Word
  count** is concerned — already excluded, with nothing to change.
- **The rule in `docs/ARCHITECTURE.md` keeps its shape and gains a named
  exception.** "Never a widget" is now "never a widget except a **Diagram**",
  which is a rule the next construct still has to argue against.
