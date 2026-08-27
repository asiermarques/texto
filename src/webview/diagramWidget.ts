import { EditorView, WidgetType } from '@codemirror/view';
import { type DiagramTheme, loadDiagramRenderer, renderDiagram } from './mermaidRenderer';

/**
 * The picture a **Diagram**'s source describes, drawn in place of the
 * **Code block** that holds it.
 *
 * The one widget in the **Live preview**. Everything else in the **Composed
 * subset** is `hide`, `mark` and `line` over the characters the **Author**
 * typed — ADR 0003 kept even a **Table**'s grid inside that rule. A
 * **Diagram** cannot be: its shape is computed from the source, not written
 * in it, so there is nothing over the Author's own characters that could
 * draw it. ADR 0004 spends the exception 009 authorised and 009 did not need.
 */
export class DiagramWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly theme: DiagramTheme
  ) {
    super();
  }

  /**
   * The `theme` half matters as much as the source: a **Diagram** carries
   * its palette baked into the SVG, so a change of **Editor theme** has to
   * count as a different widget or CodeMirror would keep the light picture
   * on the dark page.
   */
  eq(other: DiagramWidget): boolean {
    return other.source === this.source && other.theme === this.theme;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-live-diagram';
    paint(wrapper, this.source, this.theme, view);
    return wrapper;
  }

  /**
   * Lets CodeMirror handle events inside the widget as it would anywhere
   * else, so a click on the picture resolves to a document position: that
   * click is the only way into a composed **Diagram** with the mouse, the
   * same affordance US-008 of 006 had to give a **Code block**'s hidden
   * fence.
   */
  ignoreEvent(): boolean {
    return false;
  }
}

function paint(wrapper: HTMLElement, source: string, theme: DiagramTheme, view: EditorView): void {
  const svg = renderDiagram(source, theme);
  if (svg !== undefined) {
    wrapper.replaceChildren(svgElement(svg));
    return;
  }

  // Either the renderer has not arrived yet, or it could not draw this
  // source. Both start out looking the same — the Author's own source,
  // set as the Code block it is written as — and only the first of the two
  // is replaced once the renderer answers. A Diagram that cannot be drawn
  // keeps showing what the Author wrote, which is the honest thing to show
  // and the only thing they can act on.
  wrapper.replaceChildren(sourceFallback(source));

  void loadDiagramRenderer().then((mermaid) => {
    if (!mermaid || !wrapper.isConnected) {
      return;
    }
    const drawn = renderDiagram(source, theme);
    if (drawn === undefined) {
      return;
    }
    wrapper.replaceChildren(svgElement(drawn));
    // The picture is a different height from the source it replaced, and
    // CodeMirror measured the line before it existed.
    view.requestMeasure();
  });
}

/**
 * The SVG as a real element, parsed rather than assigned through
 * `innerHTML`.
 *
 * The `nonce` is the part that cannot be skipped: `beautiful-mermaid` puts
 * the diagram's whole palette in a `<style>` element inside the SVG, and the
 * webview's Content Security Policy admits no inline style without the nonce
 * it issued. Without this the diagram still draws — as unstyled black
 * shapes on nothing, which reads as a rendering bug rather than as a policy
 * one.
 */
function svgElement(svg: string): Element {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  const nonce = document.querySelector('meta[property="csp-nonce"]')?.getAttribute('content') ?? '';
  root.querySelectorAll('style').forEach((style) => style.setAttribute('nonce', nonce));
  return document.importNode(root, true);
}

function sourceFallback(source: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'cm-live-diagram-source';
  pre.textContent = source;
  return pre;
}
