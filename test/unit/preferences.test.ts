import { describe, expect, it } from 'vitest';
import { defaultPreferences, readPreferences, resolveFocusModeMigration } from '../../src/domain/preferences';

function fakeConfig(values: Record<string, unknown>) {
  return {
    get<T>(section: string, fallback: T): T {
      return section in values ? (values[section] as T) : fallback;
    },
  };
}

describe('readPreferences — US-015: preferences as VSCode settings', () => {
  it('defaults Focus mode to on and the theme to claro when nothing is configured', () => {
    expect(readPreferences(fakeConfig({}))).toEqual(defaultPreferences);
  });

  it('reads texto.modoFoco off the given configuration', () => {
    expect(readPreferences(fakeConfig({ modoFoco: false })).focusModeEnabled).toBe(false);
  });
});

describe('readPreferences — US-016: texto.tema', () => {
  it('defaults to claro', () => {
    expect(readPreferences(fakeConfig({}))).toMatchObject({ theme: 'claro' });
  });

  it('reads oscuro and vscode off the given configuration', () => {
    expect(readPreferences(fakeConfig({ tema: 'oscuro' }))).toMatchObject({ theme: 'oscuro' });
    expect(readPreferences(fakeConfig({ tema: 'vscode' }))).toMatchObject({ theme: 'vscode' });
  });

  it('falls back to claro on a value outside the three declared in package.json (a stray settings.json edit)', () => {
    expect(readPreferences(fakeConfig({ tema: 'sepia' }))).toMatchObject({ theme: 'claro' });
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
