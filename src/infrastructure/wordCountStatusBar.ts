import * as vscode from 'vscode';
import { formatWordCountStatus, type WordCountStrings } from '../domain/wordCount';

/**
 * US-006 (003): the only place allowed to call `vscode.l10n.t` for the word
 * count. Called with no interpolation args on purpose — that returns the
 * (possibly translated) template with its `{0}` placeholder still literal,
 * which `formatWordCountStatus` substitutes; see the note on
 * `WordCountStrings` for why the selection suffix needs its own singular and
 * plural strings rather than a shared skeleton.
 *
 * The singular and plural selection suffix are the same English text — "N
 * selected" does not inflect — so `l10n.t(message, ...)`'s plain overload
 * would give them the same bundle key and the Spanish translation could only
 * pick one of "seleccionada"/"seleccionadas". The `comment` option exists
 * for exactly this: VSCode appends it to the lookup key
 * (`message + '/' + comment.join('')`), so the two calls below resolve
 * independently even though their English fallback is identical.
 */
function resolveWordCountStrings(): WordCountStrings {
  return {
    totalSingular: vscode.l10n.t('{0} word'),
    totalPlural: vscode.l10n.t('{0} words'),
    selectionSingular: vscode.l10n.t({ message: '({0} selected)', comment: ['singular'] }),
    selectionPlural: vscode.l10n.t({ message: '({0} selected)', comment: ['plural'] }),
  };
}

/**
 * US-020/DEC-002: the word count lives entirely in VSCode's own status bar,
 * not one pixel inside the Writing surface. A thin wrapper around
 * `vscode.StatusBarItem` because that type has no public getter for whether
 * `.show()`/`.hide()` was last called — needed for both `WritingEditorProvider`
 * (RISK-007: only the active Writing editor's panel should keep it visible)
 * and the integration suite, which reaches this through the extension's
 * exported API the same way it reaches everything else webview-adjacent.
 */
export class WordCountStatusBar {
  private readonly item: vscode.StatusBarItem;
  private visible = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    // US-021 (redesigned on Author feedback): no `.command` here — the
    // settings live as individual buttons in `EditorToolbar`, right next to
    // this one, rather than behind a click-to-open menu.
  }

  public show(total: number, selected: number): void {
    this.item.text = formatWordCountStatus(total, selected, resolveWordCountStrings());
    this.item.show();
    this.visible = true;
  }

  public hide(): void {
    this.item.hide();
    this.visible = false;
  }

  public dispose(): void {
    this.item.dispose();
  }

  public get text(): string {
    return this.item.text;
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  /** For `WritingEditorProvider.register()` to hand to `vscode.Disposable.from`. */
  public get statusBarItem(): vscode.StatusBarItem {
    return this.item;
  }
}
