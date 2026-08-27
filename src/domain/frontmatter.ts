/**
 * **Frontmatter**: the metadata block that some tools — and some Authors —
 * put at the very top of a Chapter, fenced either by `---` (YAML, the
 * markdown convention) or by `+++` (TOML, what Hugo and its kin write).
 * Texto does not interpret it, store it or compose it; this module exists so
 * the toolbar can tell the Author it is there, and so that it is never
 * confused with the thing it looks exactly like: a **Scene break** opening
 * the Chapter.
 *
 * Pure, and line-based rather than text-based (ASM-002, the folders-by-purity
 * convention): the caller hands in only the head of the Chapter, so
 * detection never costs a scan — or a full `getText()` — of a 30,000-word
 * Chapter on every keystroke.
 */

/** Which grammar the block is written in, decided by its opening fence. */
export type FrontmatterFormat = 'yaml' | 'toml';

export interface FrontmatterBlock {
  readonly format: FrontmatterFormat;
  /** 0-based line of the closing fence. The opening one is always line 0 — a block anywhere else is not Frontmatter. */
  readonly closeLine: number;
  /** The block's top-level keys, in the order they appear. Never empty. */
  readonly fields: readonly string[];
}

/**
 * How far into the Chapter the closing fence is looked for. A `---` on the
 * first line with no partner is a Scene break, and the Author should not pay
 * a scan of the whole Chapter to be told so.
 */
export const MAX_FRONTMATTER_LINES = 200;

const YAML_FENCE = /^---[ \t]*$/;
// YAML allows `...` as an end-of-document marker; several static site
// generators emit it in place of the second `---`.
const YAML_CLOSING_FENCE = /^(?:---|\.\.\.)[ \t]*$/;
const YAML_COMMENT = /^[ \t]*#/;
const YAML_SEQUENCE_ITEM = /^[ \t]*-[ \t]/;
const YAML_CONTINUATION = /^[ \t]+\S/;
const YAML_KEY = /^([A-Za-z_][\w.-]*)[ \t]*:(?:[ \t].*)?$/;

const TOML_FENCE = /^\+\+\+[ \t]*$/;
// Bare, quoted or dotted keys, up to the `=`: `title =`, `"my key" =`,
// `params.author =`. Anchored at the start so an `=` inside a value never
// reads as a second key.
const TOML_KEY = /^[ \t]*((?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*')(?:[ \t]*\.[ \t]*(?:[A-Za-z0-9_-]+|"[^"]*"|'[^']*'))*)[ \t]*=/;

/**
 * The Frontmatter block this Chapter opens with, or `undefined` if it opens
 * with prose — or with a Scene break, which is the case worth being careful
 * about, since `---` is both.
 *
 * The two fences are read with deliberately different strictness, because
 * only one of them is ambiguous:
 *
 * - **`+++` means nothing else in markdown.** A Chapter opening with `+++`
 *   and closing the fence further down is Frontmatter, full stop, so
 *   `detectTomlBlock` validates no line shapes at all — it just looks for
 *   the closing fence and counts keys. Nothing is gained by rejecting exotic
 *   but legal TOML (multi-line arrays, `[table]` headers, `"""` strings),
 *   and a false negative here costs the Author a real indicator.
 * - **`---` is also how a Scene break is written**, so `detectYamlBlock` has
 *   to earn the reading. See its own note for the rules.
 *
 * Both fences require the block to close within `MAX_FRONTMATTER_LINES` and
 * to declare at least one field: an unclosed fence is not metadata, and
 * `---` immediately followed by `---` is two Scene breaks in a row.
 *
 * @param lines The Chapter's first lines, in order. Passing more than
 *   `MAX_FRONTMATTER_LINES` is harmless — the rest is ignored.
 */
export function detectFrontmatter(lines: readonly string[]): FrontmatterBlock | undefined {
  if (lines.length < 2) {
    return undefined;
  }
  if (TOML_FENCE.test(lines[0])) {
    return detectTomlBlock(lines);
  }
  if (YAML_FENCE.test(lines[0])) {
    return detectYamlBlock(lines);
  }
  return undefined;
}

function detectTomlBlock(lines: readonly string[]): FrontmatterBlock | undefined {
  const fields: string[] = [];
  const limit = Math.min(lines.length, MAX_FRONTMATTER_LINES);

  for (let index = 1; index < limit; index += 1) {
    if (TOML_FENCE.test(lines[index])) {
      return fields.length > 0 ? { format: 'toml', closeLine: index, fields } : undefined;
    }
    const key = TOML_KEY.exec(lines[index]);
    if (key) {
      fields.push(key[1].trim());
    }
  }

  return undefined; // no closing fence within reach
}

/**
 * What a YAML block has to look like to outrank the Scene-break reading:
 *
 * - **The line right after the opening fence is a mapping key or a comment.**
 *   This is what settles it: real Frontmatter starts declaring fields
 *   immediately, while a Scene break is always followed by a blank line and
 *   then prose. Without this rule, `---`, blank line, `Nota: algo`, blank
 *   line, `---` — an ordinary Scene at the top of a Chapter — would read as
 *   metadata.
 * - **Every later line is YAML-shaped**: a mapping key, a sequence item, an
 *   indented continuation (so block scalars like `summary: |` work), a
 *   comment, or blank. One line of prose and the whole block is prose.
 */
function detectYamlBlock(lines: readonly string[]): FrontmatterBlock | undefined {
  if (!YAML_KEY.test(lines[1]) && !YAML_COMMENT.test(lines[1])) {
    return undefined;
  }

  const fields: string[] = [];
  const limit = Math.min(lines.length, MAX_FRONTMATTER_LINES);

  for (let index = 1; index < limit; index += 1) {
    const line = lines[index];

    if (YAML_CLOSING_FENCE.test(line)) {
      return fields.length > 0 ? { format: 'yaml', closeLine: index, fields } : undefined;
    }

    const key = YAML_KEY.exec(line);
    if (key) {
      fields.push(key[1]);
      continue;
    }

    if (line.trim() === '' || YAML_COMMENT.test(line) || YAML_SEQUENCE_ITEM.test(line) || YAML_CONTINUATION.test(line)) {
      continue;
    }

    return undefined; // prose: this is a Scene break and a Scene, not metadata
  }

  return undefined; // no closing fence within reach
}
