import { type EditorState, type Range, RangeSet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { computeLivePreviewInstructions, type LivePreviewInstruction } from '../domain/livePreview';
import { DiagramWidget } from './diagramWidget';
import { currentDiagramTheme } from './mermaidRenderer';
import { treeField } from './treeField';

/**
 * Turns the pure `computeLivePreviewInstructions` output into real
 * CodeMirror decorations, and keeps `EditorView.atomicRanges` in lockstep
 * with the hidden ranges so the cursor treats a hidden marker as one unit
 * when moving or deleting (US-006's third and fourth acceptance criteria).
 *
 * Split across a `StateField` and a `ViewPlugin` since requirement 010, for
 * a reason that is CodeMirror's rather than this project's: a decoration
 * that replaces a line break — which every **Diagram** does — may only come
 * from a `StateField`, never from a `ViewPlugin`. Rather than traverse the
 * tree twice, once for each provider, the traversal happens once in the
 * field and the plugin reads its result: one **Live preview** instruction
 * list, two consumers, exactly as ADR 0001 did for the parse itself.
 */

/**
 * Recompose every **Diagram**, without the document or the selection having
 * changed. Dispatched by `main.ts` when the **Editor theme** changes: a
 * **Diagram** carries its palette baked into its SVG, so unlike every other
 * composition it cannot follow a change of theme through CSS alone.
 */
export const redrawDiagrams = StateEffect.define<void>();

interface Composition {
  readonly instructions: readonly LivePreviewInstruction[];
  /** The **Diagrams** — the only decorations that must come from the field. */
  readonly blocks: DecorationSet;
}

function compose(state: EditorState): Composition {
  const text = state.doc.toString();
  const selection = state.selection.main;
  // US-004 (008): the tree the Writing surface already owns as state,
  // updated incrementally — not re-parsed here.
  const tree = state.field(treeField);
  const instructions = computeLivePreviewInstructions(tree, text, { from: selection.from, to: selection.to });

  const theme = currentDiagramTheme();
  const blocks: Range<Decoration>[] = [];
  for (const instruction of instructions) {
    if (instruction.kind !== 'diagram') {
      continue;
    }
    // Widened to whole lines, the same way a 'line' instruction resolves its
    // own line bounds here rather than in the domain: a block replacement is
    // only legal over line boundaries, and where those fall is the
    // document's business, not the analyser's.
    const from = state.doc.lineAt(instruction.from).from;
    const to = state.doc.lineAt(instruction.to).to;
    blocks.push(Decoration.replace({ block: true, widget: new DiagramWidget(instruction.source, theme) }).range(from, to));
  }

  return { instructions, blocks: Decoration.set(blocks, true) };
}

const compositionField = StateField.define<Composition>({
  create: (state) => compose(state),
  update(value, transaction) {
    // The same three triggers the ViewPlugin used to react to on its own:
    // an edit, a cursor move, and — new in 010 — a theme change, which
    // touches neither but changes what a Diagram looks like.
    if (transaction.docChanged || transaction.selection || transaction.effects.some((effect) => effect.is(redrawDiagrams))) {
      return compose(transaction.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (composition) => composition.blocks),
});

/**
 * No `atomicRanges` for a **Diagram**, deliberately, unlike every hidden
 * marker below and unlike the **Frontmatter** fold. Those exist to keep the
 * cursor out; a **Diagram** must let the cursor in, because walking into it
 * with an arrow key is how it reveals the source to edit.
 */
class LivePreviewState {
  private composition: Composition;
  decorations: DecorationSet;
  atomicRanges: RangeSet<Decoration>;

  constructor(view: EditorView) {
    this.composition = view.state.field(compositionField);
    const built = build(view, this.composition);
    this.decorations = built.decorations;
    this.atomicRanges = built.atomicRanges;
  }

  update(update: ViewUpdate): void {
    const composition = update.state.field(compositionField);
    if (composition === this.composition) {
      return;
    }
    this.composition = composition;
    const built = build(update.view, composition);
    this.decorations = built.decorations;
    this.atomicRanges = built.atomicRanges;
  }
}

function build(view: EditorView, composition: Composition): { decorations: DecorationSet; atomicRanges: RangeSet<Decoration> } {
  const decoRanges: Range<Decoration>[] = [];
  const atomicRangeList: Range<Decoration>[] = [];

  for (const instruction of composition.instructions) {
    if (instruction.kind === 'diagram') {
      // Already a decoration, provided by `compositionField` above — a
      // ViewPlugin may not replace a line break.
      continue;
    }
    if (instruction.kind === 'hide') {
      const deco = Decoration.replace({}).range(instruction.from, instruction.to);
      decoRanges.push(deco);
      atomicRangeList.push(deco);
    } else if (instruction.kind === 'mark') {
      // Defence in depth: `Decoration.mark` throws on a zero-length range,
      // and that throw happens mid-loop, inside a ViewPlugin update — it
      // would abort composing the REST of the document too, not just this
      // one construct. `computeLivePreviewInstructions` already never
      // emits a degenerate 'mark' on purpose; this is the backstop in case
      // some future construct forgets to check.
      if (instruction.from >= instruction.to) {
        continue;
      }
      // US-005/EDGE-003: a Link's target travels as a native `title`
      // attribute on the same span — the only way to keep it discoverable
      // while it stays hidden, with no widget and no layout change.
      // US-001 of 009: a Cell's width arrives the same way — computed per
      // Table, so it cannot be a class the stylesheet knows in advance.
      const attributes = { ...instruction.attributes, ...(instruction.title !== undefined ? { title: instruction.title } : {}) };
      decoRanges.push(Decoration.mark({ class: instruction.class, attributes: Object.keys(attributes).length > 0 ? attributes : undefined }).range(instruction.from, instruction.to));
    } else {
      const lineStart = view.state.doc.lineAt(instruction.from).from;
      // US-001 of 009: a Table's Rows carry their shared width — the one
      // composition whose layout is a computed value rather than a class the
      // stylesheet can know in advance.
      decoRanges.push(Decoration.line({ class: instruction.class, attributes: instruction.attributes }).range(lineStart));
    }
  }

  return {
    decorations: Decoration.set(decoRanges, true),
    atomicRanges: RangeSet.of(atomicRangeList, true),
  };
}

const livePreviewViewPlugin = ViewPlugin.fromClass(LivePreviewState, {
  decorations: (state) => state.decorations,
});

export const livePreview = [
  compositionField,
  livePreviewViewPlugin,
  EditorView.atomicRanges.of((view) => view.plugin(livePreviewViewPlugin)?.atomicRanges ?? RangeSet.empty),
];
