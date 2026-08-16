import type { SyntaxNode } from '@lezer/common';
import { parser } from './markdownParser';
import { type SelectionRange, touches, touchesBlock } from './selectionOverlap';

/**
 * What the Live preview should do to a range of the document. Pure
 * description, no `vscode`/CodeMirror view objects — the webview's
 * `ViewPlugin` (impure, DOM-facing) turns these into real `Decoration`s and
 * `EditorView.atomicRanges`.
 */
export type LivePreviewInstruction =
  | { readonly kind: 'hide'; readonly from: number; readonly to: number }
  // `title` (US-005/EDGE-003): a Link's target, carried so the webview can
  // set it as a native `title` attribute — the only way to keep the target
  // discoverable while it stays hidden, with no widget and no layout change.
  | { readonly kind: 'mark'; readonly from: number; readonly to: number; readonly class: string; readonly title?: string }
  // A whole-line class (list bullet, blockquote rail, heading level, scene
  // break). `from`/`to` sit anywhere inside the target line; the caller
  // resolves the actual line bounds via `doc.lineAt`.
  | { readonly kind: 'line'; readonly from: number; readonly to: number; readonly class: string };

// Every inline construct that composes as "hide two marks, style the content
// between them" — StrongEmphasis and Emphasis already did; Strikethrough
// (US-002) and InlineCode (US-003) are pure additions to the same shape.
const INLINE_MARK_NODES: Record<string, { markType: string; class: string; titleIsContent?: boolean }> = {
  StrongEmphasis: { markType: 'EmphasisMark', class: 'cm-live-strong' },
  Emphasis: { markType: 'EmphasisMark', class: 'cm-live-emphasis' },
  Strikethrough: { markType: 'StrikethroughMark', class: 'cm-live-strikethrough' },
  InlineCode: { markType: 'CodeMark', class: 'cm-live-code' },
  // US-005: `<https://example.com>` — an Autolink's two LinkMark children
  // ("<" and ">") bound the URL exactly the way an EmphasisMark pair bounds
  // its content, so the same shape composes it. `titleIsContent`: the
  // content IS the target here (EDGE-003 has nothing extra to reveal).
  Autolink: { markType: 'LinkMark', class: 'cm-live-link', titleIsContent: true },
  // US-012: `[^1]` — shaped exactly like Strikethrough/InlineCode (two marks
  // bounding content), so the call composes as a superscript for free.
  FootnoteReference: { markType: 'FootnoteReferenceMark', class: 'cm-live-footnote-ref' },
};

// US-010: nesting deeper than this shares the deepest defined class —
// styles.css only defines this many depth-specific rules.
const MAX_LIST_DEPTH_CLASS = 6;

/** 1 for a top-level list, 2 for a list nested inside a ListItem of another list, and so on. */
function listDepth(node: SyntaxNode): number {
  let depth = 1;
  let ancestor = node.parent;
  while (ancestor) {
    if (ancestor.type.name === 'BulletList' || ancestor.type.name === 'OrderedList') {
      depth++;
    }
    ancestor = ancestor.parent;
  }
  return depth;
}

function lineBoundsAt(text: string, pos: number): SelectionRange {
  const from = text.lastIndexOf('\n', pos - 1) + 1;
  let to = text.indexOf('\n', pos);
  if (to === -1) {
    to = text.length;
  }
  return { from, to };
}

/**
 * The Composed subset (FR-002 of 001, extended by 006), composed as prose: markers hidden, structure styled —
 * except where the Author is currently working. Inline marks (emphasis,
 * strong) stay revealed while the selection is within the text they
 * emphasize; block markers (heading, blockquote, list, scene break) stay
 * revealed while the selection is anywhere on their physical line. Both
 * readings satisfy PD-001 ("revealed only on the cursor's line") for
 * block constructs, which *are* one line, while avoiding the inline case
 * where a single long paragraph would reveal every emphasis in it at once.
 */
export function computeLivePreviewInstructions(text: string, selection: SelectionRange): LivePreviewInstruction[] {
  const tree = parser.parse(text);
  const instructions: LivePreviewInstruction[] = [];

  function skipSpaces(from: number, limit: number): number {
    let pos = from;
    while (pos < limit && text[pos] === ' ') {
      pos++;
    }
    return pos;
  }

  function hideMarkAndSpace(mark: SyntaxNode, limit: number): void {
    instructions.push({ kind: 'hide', from: mark.from, to: skipSpaces(mark.to, limit) });
  }

  // `touchesBlock`, not `touches`: a line's `to` is the position of its own
  // line break, so a cursor resting there is still ON that line — the next
  // line starts one position further on, so there is no ambiguity to
  // resolve. The half-open rule `touches` applies is right for an inline
  // marker (a cursor just past a `**` has moved on) and wrong here, and it
  // made a Code block's fence unreachable with the mouse: the whole fence
  // line is hidden, so it renders empty and a click anywhere on it resolves
  // to the line's end — exactly the position the half-open rule read as
  // "not on this line". The fence then never came back, and the Author had
  // no way to see or fix it (US-008's second acceptance criterion).
  function isActiveLine(pos: number): boolean {
    return touchesBlock(selection, lineBoundsAt(text, pos));
  }

  // US-008: a Code block's composed look (monospace, its own ground, never
  // justified) applies to every line it spans, always — the same
  // "composition doesn't depend on the cursor" rule DEC-003 already applies
  // to a heading's size or a blockquote's rail.
  function composeCodeBlockLines(node: SyntaxNode): void {
    let pos = node.from;
    for (;;) {
      const line = lineBoundsAt(text, pos);
      instructions.push({ kind: 'line', from: line.from, to: line.from, class: 'cm-live-codeblock' });
      if (line.to >= node.to) {
        break;
      }
      pos = line.to + 1;
    }
  }

  function visit(parent: SyntaxNode): void {
    let child = parent.firstChild;
    while (child) {
      handle(child);
      child = child.nextSibling;
    }
  }

  function handle(node: SyntaxNode): void {
    const name = node.type.name;

    if (name in INLINE_MARK_NODES) {
      const { markType, class: markClass, titleIsContent } = INLINE_MARK_NODES[name];
      const marks = childrenOf(node, markType);
      if (marks.length === 2) {
        const content = { from: marks[0].to, to: marks[1].from };
        // `content.from < content.to`: an empty construct (`~~~~`, `` `` ``)
        // has nothing to mark — CodeMirror's `Decoration.mark` throws on a
        // zero-length range, which would otherwise take down every
        // decoration in the document, not just this one (RISK-004 in
        // miniature: a single bad instruction must not poison the whole
        // build). Left raw is the only sensible reading anyway: there is no
        // "content" to compose.
        if (content.from < content.to && !touches(selection, content)) {
          instructions.push({ kind: 'hide', from: marks[0].from, to: marks[0].to });
          instructions.push({ kind: 'hide', from: marks[1].from, to: marks[1].to });
          instructions.push({
            kind: 'mark',
            from: content.from,
            to: content.to,
            class: markClass,
            title: titleIsContent ? text.slice(content.from, content.to) : undefined,
          });
        }
      }
      visit(node);
      return;
    }

    if (name === 'Link' || name === 'Image') {
      const marks = childrenOf(node, 'LinkMark');
      if (marks.length >= 2) {
        const [openMark, closeMark] = marks;
        const content = { from: openMark.to, to: closeMark.from };
        // Unlike a simple wrap-marker (Strong, Emphasis: reveal only while
        // the cursor is in the text between the two marks), a Link has a
        // whole extra part after the text — "(url)" or "[ref]" — that the
        // Author is still actively typing or fixing. Gating reveal on just
        // `content` collapsed the Link the instant the cursor moved into
        // that part (typing "(" already pushed it out of `content`),
        // hiding the very thing being edited. `touchesBlock` over the
        // WHOLE node keeps it revealed anywhere inside `[text](url)`,
        // cursor included right after the closing ")" — a plain `touches`
        // there already reads as "moved past" (the emphasis convention),
        // which is one keystroke too eager for something with this much
        // more to type after the visible text. It still collapses the
        // moment the Author actually moves on: a space typed after it, the
        // selection landing elsewhere, a new line.
        //
        // `content.from < content.to`: an empty Link/Image text (`[](url)`,
        // `![](url)` — what `Cmd+K`/US-014 produces before the Author types
        // anything) has nothing to mark. Left raw rather than collapsed:
        // hiding an empty span would leave nothing at all on screen to
        // click back into, and `Decoration.mark` throws on a zero-length
        // range regardless — one bad instruction must not take down every
        // decoration in the document.
        if (content.from < content.to && !touchesBlock(selection, { from: node.from, to: node.to })) {
          const url = childrenOf(node, 'URL')[0];
          instructions.push({ kind: 'hide', from: openMark.from, to: openMark.to });
          instructions.push({ kind: 'hide', from: closeMark.from, to: node.to });
          instructions.push({
            kind: 'mark',
            from: content.from,
            to: content.to,
            class: name === 'Image' ? 'cm-live-image' : 'cm-live-link',
            title: url ? text.slice(url.from, url.to) : undefined,
          });
        }
      }
      visit(node);
      return;
    }

    // US-005: a bare URL (GFM's autolink extension, no brackets typed at
    // all) is only composed at the top level — nested inside a Link/Image
    // it is the target, already folded into that node's hide-after-the-text
    // range above; nested inside an Autolink it is that node's own content,
    // already marked by the INLINE_MARK_NODES branch.
    if (name === 'URL') {
      const parentName = node.parent?.type.name;
      if (parentName !== 'Link' && parentName !== 'Image' && parentName !== 'Autolink') {
        instructions.push({ kind: 'mark', from: node.from, to: node.to, class: 'cm-live-link', title: text.slice(node.from, node.to) });
      }
      return;
    }

    if (name === 'Escape') {
      // The node is the backslash plus the one character it escapes
      // (`\*`): the "text it marks" (FR-002) is that single character, so
      // the backslash hides unless the cursor sits on the character itself.
      const escaped = { from: node.from + 1, to: node.to };
      if (!touches(selection, escaped)) {
        instructions.push({ kind: 'hide', from: node.from, to: node.from + 1 });
      }
      return;
    }

    if (name === 'SetextHeading1' || name === 'SetextHeading2') {
      // DEC-003: the parser already resolves the "---" ambiguity by itself
      // (CommonMark reads a bare "---" right under a Paragraph as this
      // node, and only a "---" with a blank line above it as a
      // HorizontalRule) — composing this node the way ATXHeading already is
      // is the whole fix. Same typography as its ATX equivalent (DEC-003 of
      // the plan); the underline is markup, not part of the title, so
      // composition (the heading class) applies only to the title's own
      // line, not to the underline's.
      const level = name === 'SetextHeading1' ? '1' : '2';
      instructions.push({ kind: 'line', from: node.from, to: node.from, class: `cm-live-heading-${level}` });
      const mark = childrenOf(node, 'HeaderMark')[0];
      if (mark && !isActiveLine(mark.from)) {
        instructions.push({ kind: 'hide', from: mark.from, to: mark.to });
      }
      visit(node);
      return;
    }

    if (name.startsWith('ATXHeading')) {
      const level = name.slice('ATXHeading'.length);
      // Composition (size, weight) is not the cursor's business — DEC-003:
      // it stays applied whether or not the marker is currently hidden.
      instructions.push({ kind: 'line', from: node.from, to: node.to, class: `cm-live-heading-${level}` });
      if (!isActiveLine(node.from)) {
        const mark = childrenOf(node, 'HeaderMark')[0];
        if (mark) {
          hideMarkAndSpace(mark, node.to);
        }
      }
      visit(node);
      return;
    }

    if (name === 'Blockquote') {
      // Continuation lines nest their QuoteMark inside the Blockquote's
      // Paragraph child, not as a direct child of Blockquote — descend
      // through the whole subtree, not just direct children.
      for (const mark of descendantsOf(node, 'QuoteMark')) {
        // The rail (composition) stays on every line of the blockquote,
        // active or not — only the raw ">" marker depends on the cursor.
        instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-blockquote' });
        if (!isActiveLine(mark.from)) {
          hideMarkAndSpace(mark, node.to);
        }
      }
      visit(node);
      return;
    }

    if (name === 'BulletList' || name === 'OrderedList') {
      // US-010: how many BulletList/OrderedList ancestors sit above this
      // one — 1 for a top-level list, 2 for one nested inside it, and so
      // on. Capped so a pathologically deep outline still resolves to a
      // real, defined CSS class instead of an ever-growing one.
      const depth = Math.min(listDepth(node), MAX_LIST_DEPTH_CLASS);
      for (const item of childrenOf(node, 'ListItem')) {
        const mark = childrenOf(item, 'ListMark')[0];
        if (mark) {
          if (name === 'BulletList') {
            // Composition (the indent carved out by text-indent) stays
            // always; the "•" marker-substitute only appears while the real
            // dash is hidden, or both would show at once.
            instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-list-bullet' });
            if (!isActiveLine(mark.from)) {
              hideMarkAndSpace(mark, item.to);
              instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-list-bullet-mark' });
            }
          } else {
            // The number is real text, always visible — no marker to hide,
            // so no cursor dependency at all.
            instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: 'cm-live-list-number' });
          }
          instructions.push({ kind: 'line', from: mark.from, to: mark.to, class: `cm-live-list-depth-${depth}` });
        }
        visit(item);
      }
      return;
    }

    if (name === 'Task') {
      // DEC-002: the box is the Author's own "[ ]"/"[x]" characters,
      // composed by CSS on this same mark — never hidden by a `hide`
      // instruction (which would remove it from the DOM and put it out of
      // domEventHandlers' reach for US-016's click-to-toggle), and never
      // gated on the cursor: the checkbox has to be there to click, even
      // while the cursor sits on its own line.
      const marker = childrenOf(node, 'TaskMarker')[0];
      if (marker) {
        const checked = text[marker.from + 1] !== ' ';
        instructions.push({
          kind: 'mark',
          from: marker.from,
          to: marker.to,
          class: checked ? 'cm-live-task cm-live-task-checked' : 'cm-live-task cm-live-task-unchecked',
        });
      }
      visit(node);
      return;
    }

    if (name === 'FencedCode') {
      composeCodeBlockLines(node);
      const [openMark, closeMark] = childrenOf(node, 'CodeMark');
      if (openMark && !isActiveLine(openMark.from)) {
        const info = childrenOf(node, 'CodeInfo')[0];
        instructions.push({ kind: 'hide', from: openMark.from, to: info ? info.to : openMark.to });
      }
      if (closeMark && !isActiveLine(closeMark.from)) {
        instructions.push({ kind: 'hide', from: closeMark.from, to: closeMark.to });
      }
      return;
    }

    if (name === 'FootnoteDefinition' || name === 'LinkReference') {
      // US-012: apparatus, not prose — composed as a discreet block (FR-001)
      // by styling alone, always applied like a heading's size (DEC-003).
      // The marker ("[^1]:" / "[ref]:") stays visible rather than hidden:
      // unlike a Task's box or a heading's hash, it is the only label the
      // Author has for which note or reference this is, so unlike those it
      // is real content, not decoration to hide.
      instructions.push({ kind: 'line', from: node.from, to: node.from, class: 'cm-live-apparatus' });
      visit(node);
      return;
    }

    if (name === 'CodeBlock') {
      // The indented form has no fence to hide — CommonMark's marker IS the
      // leading whitespace, which stays exactly as written (DEC-004) and
      // simply renders as part of the composed line.
      composeCodeBlockLines(node);
      return;
    }

    if (name === 'HorizontalRule') {
      // Composition reserves the line's height and centring always, so the
      // neighbouring lines never shift when the raw "---" replaces the "⁂".
      instructions.push({ kind: 'line', from: node.from, to: node.to, class: 'cm-live-scene-break' });
      if (!isActiveLine(node.from)) {
        instructions.push({ kind: 'hide', from: node.from, to: node.to });
        instructions.push({ kind: 'line', from: node.from, to: node.to, class: 'cm-live-scene-break-mark' });
      }
      return;
    }

    // Anything else (Paragraph, Document, Link, Table, plain text, …) isn't
    // part of the rendered subset: recurse in case one of our node types
    // appears nested inside it, but never decorate the node itself
    // (BR-002/EDGE-002 — it stays exactly as written).
    visit(node);
  }

  function childrenOf(node: SyntaxNode, typeName: string): SyntaxNode[] {
    const result: SyntaxNode[] = [];
    let child = node.firstChild;
    while (child) {
      if (child.type.name === typeName) {
        result.push(child);
      }
      child = child.nextSibling;
    }
    return result;
  }

  function descendantsOf(node: SyntaxNode, typeName: string): SyntaxNode[] {
    const result: SyntaxNode[] = [];
    let child = node.firstChild;
    while (child) {
      if (child.type.name === typeName) {
        result.push(child);
      } else {
        result.push(...descendantsOf(child, typeName));
      }
      child = child.nextSibling;
    }
    return result;
  }

  visit(tree.topNode);
  instructions.sort((a, b) => a.from - b.from);
  return instructions;
}
