/**
 * A **Diagram** is a **Code block** whose info string is `mermaid`: the
 * Author writes the diagram's source in the **Chapter**, and the **Live
 * preview** composes it as the picture that source describes.
 *
 * This module is the whole of what the domain knows about it — which info
 * string opts a **Code block** in. Everything else (the layout, the SVG, the
 * palette) belongs to the renderer the webview loads, and nothing here
 * imports it: `src/domain/` stays pure, and the 1.5 MB of renderer stays out
 * of both bundles this module is compiled into (ADR 0004).
 */

/** The info string that turns a **Code block** into a **Diagram**. */
export const DIAGRAM_LANGUAGE = 'mermaid';

/**
 * Whether a fence's info string opts its **Code block** in.
 *
 * Matched on the first word only, case-insensitively: `mermaid`,
 * `Mermaid` and `mermaid theme=neutral` are all **Diagrams**, the way every
 * other markdown tool reads an info string, while `mermaidjs` is not — a
 * prefix match would compose a **Code block** the Author meant to keep as
 * code.
 */
export function isDiagramInfo(info: string): boolean {
  const language = info.trim().split(/\s+/, 1)[0];
  return language !== undefined && language.toLowerCase() === DIAGRAM_LANGUAGE;
}
