import { describe, expect, it } from 'vitest';
import { applyChangesToText } from '../../src/domain/textChange';

describe('applyChangesToText', () => {
  it('applies a single insertion at an offset', () => {
    const result = applyChangesToText('Hola mundo', [{ from: 4, to: 4, insert: 'a' }]);

    expect(result).toBe('Holaa mundo');
  });

  it('applies a replacement range', () => {
    const result = applyChangesToText('Hola mundo', [{ from: 5, to: 10, insert: 'gente' }]);

    expect(result).toBe('Hola gente');
  });

  it('applies several non-overlapping changes described against the original offsets', () => {
    // Both changes are expressed against the ORIGINAL text, mirroring how
    // CodeMirror's ChangeSet.iterChanges and VSCode's WorkspaceEdit both
    // describe multi-part edits: as ranges into the pre-edit document, not
    // cascading against each other.
    const result = applyChangesToText('uno dos tres', [
      { from: 0, to: 3, insert: 'UNO' },
      { from: 8, to: 12, insert: 'TRES' },
    ]);

    expect(result).toBe('UNO dos TRES');
  });

  it('returns the original text when there are no changes', () => {
    expect(applyChangesToText('sin cambios', [])).toBe('sin cambios');
  });

  it('applies a pure deletion', () => {
    const result = applyChangesToText('Hola mundo', [{ from: 4, to: 10, insert: '' }]);

    expect(result).toBe('Hola');
  });
});
