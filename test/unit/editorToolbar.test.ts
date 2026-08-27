import { describe, expect, it } from 'vitest';
import {
  buildAlignmentButtons,
  buildAllToolbarButtons,
  buildFocusModeButton,
  buildFrontmatterIndicator,
  buildRawMarkdownButton,
  buildTextSizeButtons,
  buildThemeButtons,
  buildVersionButton,
  type ToolbarStrings,
} from '../../src/domain/editorToolbar';

// US-021 (redesigned per Author feedback): each setting is its own status bar
// button, not an entry in a QuickPick menu. These functions build what each
// button shows — kept pure so "the active choice is marked" is a vitest
// assertion, not something only checkable by eye. US-005 (003): the text
// itself is no longer hard-coded here — the module stays free of `vscode` as
// a value, so every string arrives already resolved from the caller
// (`src/infrastructure/editorToolbar.ts`, the only place allowed to call
// `vscode.l10n.t`).

// A fake strings bag, distinct per key so a mix-up (e.g. the wrong tooltip on
// the wrong button) shows up as a wrong assertion rather than passing by
// coincidence — same purpose `fakeConfig` serves in preferences.test.ts.
const strings: ToolbarStrings = {
  themeLabel: { light: 'label-light', dark: 'label-dark', vscode: 'label-vscode' },
  themeTooltip: { light: 'tooltip-light', dark: 'tooltip-dark', vscode: 'tooltip-vscode' },
  alignmentLabel: { left: 'label-left', right: 'label-right', justified: 'label-justified' },
  alignmentTooltip: { left: 'tooltip-align-left', right: 'tooltip-align-right', justified: 'tooltip-align-justified' },
  sizeDecreaseTooltip: 'tooltip-size-decrease',
  sizeResetTooltip: 'tooltip-size-reset',
  sizeIncreaseTooltip: 'tooltip-size-increase',
  focusModeLabel: 'label-focus-mode',
  focusModeTooltipOn: 'tooltip-focus-on',
  focusModeTooltipOff: 'tooltip-focus-off',
  rawMarkdownLabel: 'label-raw-markdown',
  rawMarkdownTooltipOn: 'tooltip-raw-on',
  rawMarkdownTooltipOff: 'tooltip-raw-off',
  versionTooltip: 'tooltip-version',
  frontmatterTooltip: 'tooltip-frontmatter',
};

const preferences = { focusModeEnabled: true, theme: 'light', textSize: 18, alignment: 'left' } as const;
const block = { format: 'yaml', closeLine: 3, fields: ['title', 'author'] } as const;

describe('buildThemeButtons — US-021/US-005', () => {
  it('lists the three values, with the current one marked active, using the given strings', () => {
    const buttons = buildThemeButtons('dark', strings);
    expect(buttons.map((b) => b.id)).toEqual(['theme-light', 'theme-dark', 'theme-vscode']);
    expect(buttons.find((b) => b.id === 'theme-dark')?.text).toBe('$(check) label-dark');
    expect(buttons.find((b) => b.id === 'theme-light')?.text).toBe('label-light');
    expect(buttons.find((b) => b.id === 'theme-vscode')?.text).toBe('label-vscode');
    expect(buttons.find((b) => b.id === 'theme-light')?.tooltip).toBe('tooltip-light');
  });

  it('none is marked when following VSCode', () => {
    const buttons = buildThemeButtons('vscode', strings);
    expect(buttons.find((b) => b.id === 'theme-vscode')?.text).toContain('$(check)');
    expect(buttons.filter((b) => b.text.includes('$(check)'))).toHaveLength(1);
  });
});

describe('buildAlignmentButtons — US-021/US-005', () => {
  it('lists the three values, with the current one marked active, using the given strings', () => {
    const buttons = buildAlignmentButtons('right', strings);
    // left · justified · right, the order the Author asked for.
    expect(buttons.map((b) => b.id)).toEqual(['align-left', 'align-justified', 'align-right']);
    expect(buttons.find((b) => b.id === 'align-right')?.text).toBe('$(check) label-right');
    expect(buttons.find((b) => b.id === 'align-left')?.text).toBe('label-left');
    expect(buttons.find((b) => b.id === 'align-justified')?.tooltip).toBe('tooltip-align-justified');
    expect(buttons.filter((b) => b.text.includes('$(check)'))).toHaveLength(1);
  });
});

describe('buildTextSizeButtons — US-021/US-005', () => {
  it('is a decrease button, the size itself, and an increase button, tooltips from the given strings', () => {
    const buttons = buildTextSizeButtons(22, strings);
    expect(buttons.map((b) => b.id)).toEqual(['size-decrease', 'size-value', 'size-increase']);
    expect(buttons.find((b) => b.id === 'size-value')?.text).toBe('22px');
    expect(buttons.find((b) => b.id === 'size-decrease')?.text).toContain('$(remove)');
    expect(buttons.find((b) => b.id === 'size-increase')?.text).toContain('$(add)');
    expect(buttons.find((b) => b.id === 'size-decrease')?.tooltip).toBe('tooltip-size-decrease');
    expect(buttons.find((b) => b.id === 'size-value')?.tooltip).toBe('tooltip-size-reset');
    expect(buttons.find((b) => b.id === 'size-increase')?.tooltip).toBe('tooltip-size-increase');
  });
});

describe('buildFocusModeButton — US-021/US-005', () => {
  it('reflects on/off in both text and tooltip, from the given strings', () => {
    const on = buildFocusModeButton(true, strings);
    expect(on.text).toBe('$(eye) label-focus-mode');
    expect(on.tooltip).toBe('tooltip-focus-on');

    const off = buildFocusModeButton(false, strings);
    expect(off.text).toBe('$(eye-closed) label-focus-mode');
    expect(off.tooltip).toBe('tooltip-focus-off');
  });
});

describe('buildRawMarkdownButton — US-021/US-022/US-005', () => {
  it('reflects on/off in both text and tooltip, from the given strings', () => {
    const on = buildRawMarkdownButton(true, strings);
    expect(on.text).toBe('$(code) label-raw-markdown');
    expect(on.tooltip).toBe('tooltip-raw-on');

    const off = buildRawMarkdownButton(false, strings);
    expect(off.text).toBe('$(book) label-raw-markdown');
    expect(off.tooltip).toBe('tooltip-raw-off');
  });
});

describe('buildVersionButton', () => {
  it('shows the running version next to the product name, so a bare number never stands alone', () => {
    const button = buildVersionButton('0.1.4', strings);
    expect(button.id).toBe('version');
    expect(button.text).toBe('$(info) Texto 0.1.4');
    expect(button.tooltip).toBe('tooltip-version');
  });

  it('shows whatever the manifest says, pre-release suffixes included', () => {
    expect(buildVersionButton('1.0.0-beta.2', strings).text).toBe('$(info) Texto 1.0.0-beta.2');
  });
});

describe('buildFrontmatterIndicator', () => {
  it('names the block and carries the already-counted tooltip', () => {
    const indicator = buildFrontmatterIndicator(strings);
    expect(indicator.id).toBe('frontmatter');
    expect(indicator.text).toBe('$(tag) Frontmatter');
    expect(indicator.tooltip).toBe('tooltip-frontmatter');
  });
});

describe('buildAllToolbarButtons', () => {
  it('ends with the version button, the least prominent position in the group', () => {
    const buttons = buildAllToolbarButtons(preferences, false, '0.1.4', undefined, strings);
    expect(buttons.map((b) => b.id)).toEqual([
      'theme-light',
      'theme-dark',
      'theme-vscode',
      'size-decrease',
      'size-value',
      'size-increase',
      'align-left',
      'align-justified',
      'align-right',
      'focus-mode',
      'raw-markdown',
      'version',
    ]);
  });

  it('leads with the Frontmatter indicator when the Chapter has a block', () => {
    const buttons = buildAllToolbarButtons(preferences, false, '0.1.4', block, strings);
    expect(buttons[0].id).toBe('frontmatter');
    expect(buttons).toHaveLength(13);
  });

  it('leaves the indicator out entirely when the Chapter has none', () => {
    const buttons = buildAllToolbarButtons(preferences, false, '0.1.4', undefined, strings);
    expect(buttons.some((b) => b.id === 'frontmatter')).toBe(false);
    expect(buttons).toHaveLength(12);
  });
});
