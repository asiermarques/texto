import { describe, expect, it } from 'vitest';
import { EditOriginTracker } from '../../src/domain/editOriginTracker';

describe('EditOriginTracker', () => {
  it('recognizes a marked version as an own change, once', () => {
    const tracker = new EditOriginTracker();
    tracker.markOwnEdit(4);

    expect(tracker.isOwnChange(4)).toBe(true);
    // Consumed: the same version reported twice would be a bug (e.g. a
    // duplicated change event), so the second check must not still say "own".
    expect(tracker.isOwnChange(4)).toBe(false);
  });

  it('treats an unmarked version as an external change', () => {
    const tracker = new EditOriginTracker();

    expect(tracker.isOwnChange(1)).toBe(false);
  });

  it('tracks several pending own edits independently', () => {
    const tracker = new EditOriginTracker();
    tracker.markOwnEdit(2);
    tracker.markOwnEdit(5);

    expect(tracker.isOwnChange(5)).toBe(true);
    expect(tracker.isOwnChange(3)).toBe(false);
    expect(tracker.isOwnChange(2)).toBe(true);
  });
});
