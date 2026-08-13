import { markdownLanguage } from '@codemirror/lang-markdown';
import type { SyntaxNode } from '@lezer/common';
import { type SelectionRange, touches } from './selectionOverlap';

/**
 * What the Live preview should do to a range of the document. Pure
 * description, no `vscode`/CodeMirror view objects — the webview's
 * `ViewPlugin` (impure, DOM-facing) turns these into real `Decoration`s and
 * `EditorView.atomicRanges`.
 */
export type LivePreviewInstruction =
  | { readonly kind: 'hide'; readonly from: number; readonly to: number }
  | { readonly kind: 'mark'; readonly from: number; readonly to: number; readonly class: string }
  // A whole-line class (list bullet, blockquote rail, heading level, scene
  // break). `from`/`to` sit anywhere inside the target line; the caller
  // resolves the actual line bounds via `doc.lineAt`.
  | { readonly kind: 'line'; readonly from: number; readonly to: number; readonly class: string };

function lineBoundsAt(text: string, pos: number): SelectionRange {
  const from = text.lastIndexOf('\n', pos - 1) + 1;
  let to = text.indexOf('\n', pos);
  if (to === -1) {
    to = text.length;
  }
  return { from, to };
}

/**
 * The FR-002 subset, composed as prose: markers hidden, structure styled —
 * except where the Author is currently working. Inline marks (emphasis,
 * strong) stay revealed while the selection is within the text they
 * emphasize; block markers (heading, blockquote, list, scene break) stay
 * revealed while the selection is anywhere on their physical line. Both
 * readings satisfy PD-001 ("revealed only on the cursor's line") for
 * block constructs, which *are* one line, while avoiding the inline case
 * where a single long paragraph would reveal every emphasis in it at once.
 */
export function computeLivePreviewInstructions(text: string, selection: SelectionRange): LivePreviewInstruction[] {
  const tree = markdownLanguage.parser.parse(text);
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

  function isActiveLine(pos: number): boolean {
    return touches(selection, lineBoundsAt(text, pos));
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

    if (name === 'StrongEmphasis' || name === 'Emphasis') {
      const marks = childrenOf(node, 'EmphasisMark');
      if (marks.length === 2) {
        const content = { from: marks[0].to, to: marks[1].from };
        if (!touches(selection, content)) {
          instructions.push({ kind: 'hide', from: marks[0].from, to: marks[0].to });
          instructions.push({ kind: 'hide', from: marks[1].from, to: marks[1].to });
          instructions.push({
            kind: 'mark',
            from: content.from,
            to: content.to,
            class: name === 'StrongEmphasis' ? 'cm-live-strong' : 'cm-live-emphasis',
          });
        }
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
        }
        visit(item);
      }
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
