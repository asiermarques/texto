# PRODUCT

## What it is

An editor for writing fiction **inside VSCode**, with a writing surface worth
using: markdown hidden, readable typography, no distractions. The texts are
`.md` files in a git repository.

## Who it is for

**One person: the author of this repository.** A single user, who is also a
developer and already lives in VSCode and git.

This is a decision, not a placeholder waiting for a market. There is no
onboarding, no third-party installation, no accounts, no support, no
monetisation, no marketplace. Technical vocabulary (git, commits, branches) is
not an obstacle, and the only measure that counts is whether it actually gets
used.

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


## MVP scope

In: a custom editor for `.md` inside VSCode with live preview; a careful writing
surface (typography, measure, focus); files in a git repo with history read
through VSCode; the writing environment configured and versioned next to the
text; a word count.

Out: any sync of our own, work structure, AI review, anything aimed at a third
party.

