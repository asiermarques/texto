import { describe, expect, it } from 'vitest';
import {
  clampTextSize,
  decreaseTextSize,
  defaultPreferences,
  increaseTextSize,
  isEditorTheme,
  isTextAlignment,
  readPreferences,
  resolveFocusModeMigration,
  resolveWriteScope,
  TEXT_SIZE_DEFAULT,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
} from '../../src/domain/preferences';

function fakeConfig(values: Record<string, unknown>) {
  return {
    get<T>(section: string, fallback: T): T {
      return section in values ? (values[section] as T) : fallback;
    },
  };
}

describe('readPreferences — US-015: preferences as VSCode settings', () => {
  it('defaults Focus mode to on and the theme to light when nothing is configured', () => {
    expect(readPreferences(fakeConfig({}))).toEqual(defaultPreferences);
  });

  it('reads texto.focusMode off the given configuration', () => {
    expect(readPreferences(fakeConfig({ focusMode: false })).focusModeEnabled).toBe(false);
  });
});

describe('readPreferences — US-016: texto.theme', () => {
  it('defaults to light', () => {
    expect(readPreferences(fakeConfig({}))).toMatchObject({ theme: 'light' });
  });

  it('reads dark and vscode off the given configuration', () => {
    expect(readPreferences(fakeConfig({ theme: 'dark' }))).toMatchObject({ theme: 'dark' });
    expect(readPreferences(fakeConfig({ theme: 'vscode' }))).toMatchObject({ theme: 'vscode' });
  });

  it('falls back to light on a value outside the three declared in package.json (a stray settings.json edit)', () => {
    expect(readPreferences(fakeConfig({ theme: 'sepia' }))).toMatchObject({ theme: 'light' });
  });

  it('BR-004: a Writing space still pinning the old Spanish value falls back to the default', () => {
    expect(readPreferences(fakeConfig({ theme: 'claro' }))).toMatchObject({ theme: 'light' });
  });
});

describe('readPreferences — US-017: texto.textSize', () => {
  it('defaults to the factory size', () => {
    expect(readPreferences(fakeConfig({}))).toMatchObject({ textSize: TEXT_SIZE_DEFAULT });
  });

  it('reads texto.textSize off the given configuration', () => {
    expect(readPreferences(fakeConfig({ textSize: 22 }))).toMatchObject({ textSize: 22 });
  });

  it('clamps a value outside the declared range (a stray settings.json edit)', () => {
    expect(readPreferences(fakeConfig({ textSize: 4 }))).toMatchObject({ textSize: TEXT_SIZE_MIN });
    expect(readPreferences(fakeConfig({ textSize: 400 }))).toMatchObject({ textSize: TEXT_SIZE_MAX });
  });
});

describe('readPreferences — US-019: texto.alignment', () => {
  it('defaults to left', () => {
    expect(readPreferences(fakeConfig({}))).toMatchObject({ alignment: 'left' });
  });

  it('reads right and justified off the given configuration', () => {
    expect(readPreferences(fakeConfig({ alignment: 'right' }))).toMatchObject({ alignment: 'right' });
    expect(readPreferences(fakeConfig({ alignment: 'justified' }))).toMatchObject({ alignment: 'justified' });
  });

  it('falls back to left on a value outside the three declared in package.json', () => {
    expect(readPreferences(fakeConfig({ alignment: 'centrado' }))).toMatchObject({ alignment: 'left' });
  });

  it('BR-004: a Writing space still pinning the old Spanish value falls back to the default', () => {
    expect(readPreferences(fakeConfig({ alignment: 'izquierda' }))).toMatchObject({ alignment: 'left' });
  });
});

describe('clampTextSize / increaseTextSize / decreaseTextSize — US-017', () => {
  it('clamps to the declared range', () => {
    expect(clampTextSize(TEXT_SIZE_MIN - 10)).toBe(TEXT_SIZE_MIN);
    expect(clampTextSize(TEXT_SIZE_MAX + 10)).toBe(TEXT_SIZE_MAX);
    expect(clampTextSize(TEXT_SIZE_DEFAULT)).toBe(TEXT_SIZE_DEFAULT);
  });

  it('increases and decreases by one step, staying inside the range', () => {
    const bigger = increaseTextSize(TEXT_SIZE_DEFAULT);
    expect(bigger).toBeGreaterThan(TEXT_SIZE_DEFAULT);
    expect(decreaseTextSize(bigger)).toBe(TEXT_SIZE_DEFAULT);
  });

  it('does not go below the minimum, however many times it is reduced', () => {
    let value = TEXT_SIZE_DEFAULT;
    for (let i = 0; i < 20; i += 1) {
      value = decreaseTextSize(value);
    }
    expect(value).toBe(TEXT_SIZE_MIN);
  });

  it('does not go above the maximum, however many times it is increased', () => {
    let value = TEXT_SIZE_DEFAULT;
    for (let i = 0; i < 20; i += 1) {
      value = increaseTextSize(value);
    }
    expect(value).toBe(TEXT_SIZE_MAX);
  });
});

describe("isEditorTheme / isTextAlignment — US-021: guarding the toolbar commands' arguments", () => {
  it('accepts every declared value and rejects anything else, including the pre-US-002 Spanish values', () => {
    expect(isEditorTheme('light')).toBe(true);
    expect(isEditorTheme('dark')).toBe(true);
    expect(isEditorTheme('vscode')).toBe(true);
    expect(isEditorTheme('sepia')).toBe(false);
    expect(isEditorTheme('claro')).toBe(false);
    expect(isEditorTheme(undefined)).toBe(false);

    expect(isTextAlignment('left')).toBe(true);
    expect(isTextAlignment('right')).toBe(true);
    expect(isTextAlignment('justified')).toBe(true);
    expect(isTextAlignment('centrado')).toBe(false);
    expect(isTextAlignment('izquierda')).toBe(false);
    expect(isTextAlignment(undefined)).toBe(false);
  });
});

describe('resolveFocusModeMigration — US-015: migration from context.globalState', () => {
  it('does nothing when the Author never toggled Focus mode before (no legacy value)', () => {
    expect(resolveFocusModeMigration(undefined, false)).toBeUndefined();
  });

  it('carries the legacy value into the setting when the setting is still untouched', () => {
    expect(resolveFocusModeMigration(false, false)).toBe(false);
    expect(resolveFocusModeMigration(true, false)).toBe(true);
  });

  it('does not override a value the Author already configured explicitly, even with a legacy value present', () => {
    expect(resolveFocusModeMigration(false, true)).toBeUndefined();
  });
});

describe('resolveWriteScope — a preference write the Author can actually see', () => {
  it('writes globally when nothing pins the setting: it is the Author\'s choice, not the Chapter\'s', () => {
    expect(resolveWriteScope(undefined)).toBe('global');
    expect(resolveWriteScope({})).toBe('global');
  });

  it('writes to the Writing space folder when its own settings.json pins the setting', () => {
    // The bug: pinned at folder scope, written at Global scope, VSCode
    // resolves folder over global — the Chapter never changed and the
    // toolbar button looked dead.
    expect(resolveWriteScope({ workspaceFolderValue: 'light' })).toBe('folder');
  });

  it('writes to the workspace when that is where the setting is pinned', () => {
    expect(resolveWriteScope({ workspaceValue: false })).toBe('workspace');
  });

  it('prefers the most specific scope, the same order VSCode resolves them in', () => {
    expect(resolveWriteScope({ workspaceFolderValue: 'dark', workspaceValue: 'light' })).toBe('folder');
  });

  it('treats a pinned `false` as pinned — it is a value, not an absence', () => {
    expect(resolveWriteScope({ workspaceFolderValue: false })).toBe('folder');
  });
});
