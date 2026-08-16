import { type Range, RangeSet } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { computeLivePreviewInstructions } from '../domain/livePreview';

/**
 * Turns the pure `computeLivePreviewInstructions` output into real
 * CodeMirror decorations, and keeps `EditorView.atomicRanges` in lockstep
 * with the hidden ranges so the cursor treats a hidden marker as one unit
 * when moving or deleting (US-006's third and fourth acceptance criteria).
 */
class LivePreviewState {
  decorations: DecorationSet;
  atomicRanges: RangeSet<Decoration>;

  constructor(view: EditorView) {
    const built = build(view);
    this.decorations = built.decorations;
    this.atomicRanges = built.atomicRanges;
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.selectionSet) {
      const built = build(update.view);
      this.decorations = built.decorations;
      this.atomicRanges = built.atomicRanges;
    }
  }
}

function build(view: EditorView): { decorations: DecorationSet; atomicRanges: RangeSet<Decoration> } {
  const text = view.state.doc.toString();
  const selection = view.state.selection.main;
  const instructions = computeLivePreviewInstructions(text, { from: selection.from, to: selection.to });
  const decoRanges: Range<Decoration>[] = [];
  const atomicRangeList: Range<Decoration>[] = [];

  for (const instruction of instructions) {
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
      const attributes = instruction.title !== undefined ? { title: instruction.title } : undefined;
      decoRanges.push(Decoration.mark({ class: instruction.class, attributes }).range(instruction.from, instruction.to));
    } else {
      const lineStart = view.state.doc.lineAt(instruction.from).from;
      decoRanges.push(Decoration.line({ class: instruction.class }).range(lineStart));
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
  livePreviewViewPlugin,
  EditorView.atomicRanges.of((view) => view.plugin(livePreviewViewPlugin)?.atomicRanges ?? RangeSet.empty),
];
