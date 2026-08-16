import { describe, expect, it } from 'vitest';
import { toggleTaskMarkerAt } from '../../src/domain/taskToggle';

describe('toggleTaskMarkerAt — US-016: click to toggle a Task', () => {
  it('ticks an unchecked Task, flipping "[ ]" to "[x]"', () => {
    const text = '- [ ] tarea sin hacer';
    const pos = text.indexOf('[ ]');

    const change = toggleTaskMarkerAt(text, pos);

    expect(change).toEqual({ from: pos + 1, to: pos + 2, insert: 'x' });
  });

  it('unticks a checked Task, flipping "[x]" back to "[ ]"', () => {
    const text = '- [x] tarea hecha';
    const pos = text.indexOf('[x]');

    const change = toggleTaskMarkerAt(text, pos);

    expect(change).toEqual({ from: pos + 1, to: pos + 2, insert: ' ' });
  });

  it('resolves from any position within the marker, not just its start', () => {
    const text = '- [ ] tarea sin hacer';
    const pos = text.indexOf('[ ]') + 2; // on the "]"

    const change = toggleTaskMarkerAt(text, pos);

    expect(change).toEqual({ from: text.indexOf('[ ]') + 1, to: text.indexOf('[ ]') + 2, insert: 'x' });
  });

  it('returns null when the position is not on a Task marker', () => {
    const text = '- [ ] tarea sin hacer';
    expect(toggleTaskMarkerAt(text, text.indexOf('tarea'))).toBeNull();
    expect(toggleTaskMarkerAt(text, 0)).toBeNull(); // on the plain list dash
  });
});
