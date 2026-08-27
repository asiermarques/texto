import { describe, expect, it } from 'vitest';
import { detectFrontmatter, MAX_FRONTMATTER_LINES } from '../../src/domain/frontmatter';

// The whole point of this module is telling Frontmatter apart from a Scene
// break, which is written with the same three characters. Every "not
// Frontmatter" case below is a real shape an Author can write, not a
// pathological one.

const lines = (text: string): string[] => text.split('\n');

describe('detectFrontmatter — a Chapter that opens with metadata', () => {
  it('reads the fences and the top-level fields', () => {
    const block = detectFrontmatter(lines('---\ntitle: Capítulo primero\nauthor: Asier\n---\n\nUn párrafo.'));
    expect(block).toBeDefined();
    expect(block!.format).toBe('yaml');
    expect(block!.closeLine).toBe(3);
    expect(block!.fields).toEqual(['title', 'author']);
  });

  it('accepts `...` as the closing fence, the way some generators write it', () => {
    const block = detectFrontmatter(lines('---\ntitle: Algo\n...\n\nUn párrafo.'));
    expect(block?.closeLine).toBe(2);
  });

  it('counts a key with no value, and one with a value, alike', () => {
    expect(detectFrontmatter(lines('---\ndraft:\ntitle: Algo\n---'))?.fields).toEqual(['draft', 'title']);
  });

  it('carries sequences and block scalars without counting their lines as fields', () => {
    const block = detectFrontmatter(lines('---\ntags:\n  - novela\n  - borrador\nsummary: |\n  Una línea.\n  Otra línea.\n---'));
    expect(block?.fields).toEqual(['tags', 'summary']);
    expect(block?.closeLine).toBe(7);
  });

  it('allows comments and blank lines inside the block', () => {
    const block = detectFrontmatter(lines('---\n# escrito a mano\ntitle: Algo\n\nauthor: Asier\n---'));
    expect(block?.fields).toEqual(['title', 'author']);
  });

  it('tolerates trailing whitespace on the fences', () => {
    expect(detectFrontmatter(lines('---  \ntitle: Algo\n---\t'))).toBeDefined();
  });
});

describe('detectFrontmatter — a TOML block, the `+++` fence Hugo writes', () => {
  it('reads the exact shape a Hugo Chapter opens with', () => {
    const block = detectFrontmatter(
      lines(
        "+++\ntitle = 'Caminos'\ndescription = 'Un micro sobre caminos'\ndate = 2025-08-01T18:06:07+02:00\ndraft = false\n+++\n\nUn párrafo."
      )
    );
    expect(block).toBeDefined();
    expect(block!.format).toBe('toml');
    expect(block!.closeLine).toBe(5);
    expect(block!.fields).toEqual(['title', 'description', 'date', 'draft']);
  });

  it('does not mistake an `=` inside a value for a second key', () => {
    expect(detectFrontmatter(lines('+++\nurl = "https://x.test/?a=1&b=2"\n+++'))?.fields).toEqual(['url']);
  });

  it('reads quoted and dotted keys', () => {
    const block = detectFrontmatter(lines('+++\n"my key" = 1\nparams.author = "Asier"\n+++'));
    expect(block?.fields).toEqual(['"my key"', 'params.author']);
  });

  it('carries table headers and multi-line arrays without counting their lines as keys', () => {
    const block = detectFrontmatter(lines('+++\ntags = [\n  "novela",\n  "borrador",\n]\n\n[params]\nauthor = "Asier"\n+++'));
    expect(block?.fields).toEqual(['tags', 'author']);
    expect(block?.closeLine).toBe(8);
  });

  it('needs the matching fence: a `---` never closes a `+++` block', () => {
    expect(detectFrontmatter(lines('+++\ntitle = "Algo"\n---\n\nUn párrafo.'))).toBeUndefined();
  });

  it('ignores an unclosed block, and an empty pair of fences', () => {
    expect(detectFrontmatter(lines('+++\ntitle = "Algo"'))).toBeUndefined();
    expect(detectFrontmatter(lines('+++\n+++\n\nUn párrafo.'))).toBeUndefined();
  });
});

describe('detectFrontmatter — a Chapter that opens with a Scene break', () => {
  it('does not read an opening Scene break and a later one as a block', () => {
    expect(detectFrontmatter(lines('---\n\nUna escena.\n\n---\n\nOtra escena.'))).toBeUndefined();
  });

  it('does not read prose that happens to contain a colon as a field', () => {
    // The blank line after the opening `---` is what settles it: real
    // Frontmatter starts declaring fields on the very next line.
    expect(detectFrontmatter(lines('---\n\nNota: esto es prosa.\n\n---'))).toBeUndefined();
  });

  it('does not read two consecutive Scene breaks as an empty block', () => {
    expect(detectFrontmatter(lines('---\n---\n\nUn párrafo.'))).toBeUndefined();
  });

  it('stops at the first line of prose inside an otherwise YAML-shaped head', () => {
    expect(detectFrontmatter(lines('---\ntitle: Algo\nesto ya es prosa\n---'))).toBeUndefined();
  });
});

describe('detectFrontmatter — a Chapter with no block at all', () => {
  it('ignores a Chapter that opens with prose', () => {
    expect(detectFrontmatter(lines('Un párrafo.\n\n---\ntitle: Algo\n---'))).toBeUndefined();
  });

  it('ignores a block that is not at the very top', () => {
    expect(detectFrontmatter(lines('\n---\ntitle: Algo\n---'))).toBeUndefined();
  });

  it('ignores an opening fence with nothing after it', () => {
    expect(detectFrontmatter(['---'])).toBeUndefined();
    expect(detectFrontmatter([])).toBeUndefined();
  });

  it('ignores an unclosed block rather than swallowing the whole Chapter', () => {
    expect(detectFrontmatter(lines('---\ntitle: Algo\nauthor: Asier'))).toBeUndefined();
  });

  it('gives up past MAX_FRONTMATTER_LINES instead of scanning a long Chapter', () => {
    const head = ['---', ...Array.from({ length: MAX_FRONTMATTER_LINES }, (_, i) => `field${i}: valor`), '---'];
    expect(detectFrontmatter(head)).toBeUndefined();

    const short = ['---', ...Array.from({ length: MAX_FRONTMATTER_LINES - 2 }, (_, i) => `field${i}: valor`), '---'];
    expect(detectFrontmatter(short)).toBeDefined();
  });
});
