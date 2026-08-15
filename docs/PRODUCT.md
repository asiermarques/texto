# PRODUCT

## What it is

An editor for writing fiction **inside VSCode**, with a writing surface worth
using: markdown hidden, readable typography, no distractions. The texts are
`.md` files in a git repository.

## Who it is for

**The Author of this repository, first — and now, deliberately, anyone else
who wants to write fiction this way (PD-006).** It was built for one person,
who is also a developer and already lives in VSCode and git; that is still the
primary design target, and technical vocabulary (git, commits, branches) is
still not treated as an obstacle to remove.

There is still no onboarding flow, no accounts, no support, no monetisation.
What changed is narrower: the interface is no longer allowed to assume its
only reader is the Author, because the Author now intends to share the
extension itself with other people — including through the tag-based release
pipeline that publishes it to the VS Code Marketplace and Open VSX Registry
(see MVP scope, below). The only measure that counts is still whether it
actually gets used — by the Author or by anyone else.

## The problem

Fiction is written today in **Google Docs, on a Mac**. It works, but the text is
not in an open format, the draft history is useless, and the writing surface was
not designed for fiction.

## Success criterion

**Google Docs stops being opened to write fiction.**

The only criterion that matters, and unambiguously observable. If a month after
it is finished Docs is still being opened, the project failed, however good its
technical decisions were.

## Product decisions

- **PD-001 — Markdown is the source of truth, and it is not seen.** Texts are
  `.md` files. On screen the syntax is hidden and styling is applied while
  typing (*live preview*), revealed only around the cursor. *Why:* the comfort
  of Google Docs without giving up an open, portable format.
- **PD-002 — A good UI is a precondition, not an extra.** If the writing
  surface is not up to standard, this does not get used and Docs wins. It
  cannot be deferred to the end: it *is* the project. The reference for feel is
  iA Writer.
- **PD-003 — Draft history through git.** Previous versions must be visible and
  comparable. Git is the mechanism and VSCode already ships the interface to
  read it, so no versioning system gets built.
- **PD-004 — VSCode only.** One environment. No iPad, no browser, no
  standalone desktop app.
- **PD-005 — One Paragraph, one line.** A **Paragraph** is a single line of the
  markdown file; the **Writing surface** wraps it on screen. Markdown files
  hard-wrapped by hand at a fixed column are not the shape this editor
  composes: every source line becomes a block of its own, so justified text
  cannot straighten a right margin that ends mid-sentence, and the column's
  measure (US-018) stops meaning anything. *Why:* the same choice iA Writer
  and Ulysses make — the measure is the editor's to decide, not the file's,
  and it has to be free to change with the **Text size**. The `.md` stays
  perfectly standard either way; this is about how a **Work** is written, not
  about the format.
- **PD-006 — The extension may be shared beyond the Author.** Superseding the
  original "one person" framing under "Who it is for": that framing was right
  while the only user was the Spanish-writing Author, but a Spanish-only
  interface and Spanish setting identifiers make the extension unusable for
  anyone else the moment it is shared. *Why:* the Author now intends to share
  it, so the interface presents itself in Spanish or English, following
  VSCode's own display language, while the setting identifiers become English
  like every other key in a `settings.json` (`.workflow/requisites/003-bilingual-interface-english-defaults.md`).
  This removes the Spanish-only blocker; the tag-based release pipeline (see
  MVP scope, below) is the mechanism that actually schedules the marketplace
  release this decision anticipates.

## MVP scope

In: a custom editor for `.md` inside VSCode with live preview; a careful writing
surface (typography, measure, focus); files in a git repo with history read
through VSCode; the writing environment configured and versioned next to the
text; a word count; a bilingual interface (Spanish/English, PD-006); a
tag-based release pipeline publishing to the VS Code Marketplace and the Open
VSX Registry (PD-006's sharing commitment, made real).

Out: any sync of our own, work structure, AI review, onboarding, accounts or
support for a third party.

