import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { computeDimmedRanges } from '../domain/focusMode';
import { treeField } from './treeField';

const dimMark = Decoration.mark({ class: 'cm-live-dim' });

function build(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  const selection = view.state.selection.main;
  // US-004 (008): the same tree livePreviewPlugin.ts reads — one parse, two readers.
  const tree = view.state.field(treeField);
  const dimmed = computeDimmedRanges(tree, text, { from: selection.from, to: selection.to });
  const ranges: Range<Decoration>[] = dimmed.filter((r) => r.from < r.to).map((r) => dimMark.range(r.from, r.to));
  return Decoration.set(ranges, true);
}

class FocusModeState {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = build(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.selectionSet) {
      this.decorations = build(update.view);
    }
  }
}

const focusModeViewPlugin = ViewPlugin.fromClass(FocusModeState, {
  decorations: (state) => state.decorations,
});

export const focusMode = [focusModeViewPlugin];
