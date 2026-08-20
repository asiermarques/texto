---
title: Guard performance per commit with deterministic work counters, not wall-clock timing
status: Proposed
date: 2026-08-20
tags: [performance, ci, testing]
---

# 0002. Guard performance per commit with deterministic work counters, not wall-clock timing

## Context and problem statement

ADR 0001 measured the **Writing editor**'s hot path and found three full
markdown parses per keystroke. That measurement was taken by hand, once. The
question this ADR answers is different and ongoing: **how does every commit
tell the Author whether a new feature made the editor faster or slower?**

The project already has one performance test, `test/unit/livePreviewLatency.test.ts`,
and its own comment explains why it cannot serve this purpose. Its budget is
40ms against fixtures that "come in under 11ms" measured in isolation, because
"sharing the run with the rest of the suite pushes that as high as ~19ms" — a
70% swing on the *same* machine, from nothing but CPU contention. The comment
is explicit that the budget "only needs to catch a real, order-of-magnitude
regression — a flaky pass/fail on system noise would defeat the point of
measuring at all". That is a smoke alarm, not a scale.

Three things were verified before choosing:

- **Wall-clock noise, best case.** The real domain functions
  (`computeLivePreviewInstructions` + `computeDimmedRanges`, 24-section
  fixture), median of 20 samples, across 10 separate process launches on an
  idle dedicated machine: 4.07ms to 4.89ms — **20% spread**. A GitHub-hosted
  `ubuntu-latest` runner shares vCPUs with other tenants and is worse. A
  threshold loose enough not to flake would sit above ~30%, which is blind to
  exactly the 5–15% drift this system is meant to catch.
- **`vitest bench --compare` does not gate.** The flags exist in the installed
  Vitest 2.1.9 (`--outputJson`, `--compare`), but a run compared against its
  own stored baseline **exits 0** while printing `[1.05x] ⇑`. It is a report,
  not a check; using it as a gate means writing the comparator anyway.
- **Wall-clock microbenchmarks fail silently.** While probing the above, a
  synthetic benchmark reported **0.95x for 4x the work**, because V8 eliminated
  a loop whose result was discarded. A performance test that cannot tell 4x
  from 1x is worse than no test, because it produces confidence rather than
  doubt.

The common cause is that wall-clock time is a function of the *machine*. A
per-commit signal has to be a function of the *code*.

## Decision drivers

- **Sensitivity.** The signal must resolve a single added parse or a single
  added decoration per update — the two regressions that actually happened
  here (ADR 0001) — not just order-of-magnitude collapses.
- **Zero flake (maintainability).** A performance check that fails randomly
  gets disabled, or worse, ignored while still red. Determinism is not a nice
  property here, it is the whole requirement.
- **Cost.** One Author, no infrastructure budget, no servers of our own. The
  check should add near-zero CI minutes and no secrets.
- **Maintainability.** It must slot into the existing gate
  (`.github/workflows/gate.yml`, already reused by `ci.yml` and `release.yml`)
  as one more step, and honour CLAUDE.md's split between pure-domain unit tests
  and everything else.
- **Legibility over time.** "Did this feature make it slower?" should be
  answerable from the git history, not from a dashboard someone has to
  remember to open.

## Considered options

1. **Keep only the existing loose wall-clock budget.** Catches catastrophes,
   answers nothing per commit.
2. **Wall-clock benchmarks with a committed baseline** — `vitest bench
   --outputJson` committed, `--compare` in CI plus a comparator script to fail
   on a delta.
3. **Hosted instrumented benchmarking** (CodSpeed or equivalent): CPU-level
   measurement immune to runner noise, free tiers for open source, PR comments
   with per-benchmark deltas.
4. **Deterministic work counters plus bundle bytes, against a committed
   baseline**, asserted as an ordinary test.

## Decision outcome

Chosen option: **"Deterministic work counters plus bundle bytes, against a
committed baseline"**, with the existing wall-clock test kept, unchanged in
role, as the order-of-magnitude guard.

**The metrics are quantities the machine cannot influence.** All of them are
functions of the source and a fixed fixture:

| Metric | How it is obtained |
|---|---|
| `parsesPerKeystroke` | `vi.spyOn(parser, 'parse')` around one simulated document change |
| `parsesPerCursorMove` | the same spy around one selection-only change |
| `livePreviewInstructions@<fixture>` | `computeLivePreviewInstructions(...).length` |
| `dimRanges@<fixture>` | `computeDimmedRanges(...).length` |
| `extensionBundleBytes` | byte length of the built `dist/extension.js` |
| `webviewBundleBytes` | byte length of the built `dist/webview.js` |

Two of these need no instrumentation of production code at all — the
instruction and dim-range counts are already the return values of the pure
analysers, which is a direct dividend of AD-002's split. The parse counts need
only a test-local spy: verified working against the real
`src/domain/markdownParser.ts`, and it independently reproduced ADR 0001's
finding, returning exactly **3**. The bundle bytes are stable because esbuild's
output is reproducible: three consecutive minified builds of
`src/extension.ts` produced the **identical SHA-256** and identical byte count.

**The baseline is a committed file, compared for exact equality.** A metric
that moves in either direction fails the check until the baseline is updated in
the same commit. This is the mechanism, not a side effect of it: a commit that
adds a second parse per keystroke carries `parsesPerKeystroke: 1 → 2` **in its
own diff**, next to the change that caused it, and the git history of that one
file becomes the **Writing editor**'s performance changelog. Improvements are
recorded for the same reason regressions are — a win nobody wrote down is a win
that silently erodes later.

**The Author is told by a pre-commit hook, with CI as the backstop.** This half
was missing from the first draft of this ADR, which justified the exact
baseline by the review it would get in a pull request. This repository does not
work that way and there is no reason it should: it has no merge commits at all,
`main` is not a protected branch, and all ten commits to date went straight to
it. A signal that only arrives from `ci.yml` arrives about a minute *after* the
regression is already on `main`.

So the check runs locally, before the commit exists, from a versioned
`.githooks/pre-commit` enabled with `git config core.hooksPath` — git's own
mechanism, no `husky` dependency for something git does natively, wired through
npm's `prepare` script so a fresh clone gets it on `npm install`. The whole
check fits the budget a hook has to respect: **~0.5s** for `npm run build`
(needed for the bundle-byte metrics) plus **~1.0s** for a single-file vitest
run — about **1.5s** total, measured, against the ~1m13s the full gate takes.
That is why the counters and the bundle bytes stay in one hook instead of being
split by cost.

A hook is bypassable (`git commit --no-verify`) and does not run on a
contributor's machine, so `gate.yml` keeps running the same check: the hook is
the fast signal, CI is the one that cannot be skipped. Neither replaces the
other.

**What the Author can actually look at.** Three artefacts, in ascending cost,
none of them a service:

- `git log -p test/performance-baseline.json` — the performance changelog,
  free and already implied by committing the baseline: every commit that moved
  a number, with the number.
- A step summary in CI — the same table written to `$GITHUB_STEP_SUMMARY`,
  which GitHub renders as Markdown on the run page, so a run reports its
  metrics without anyone opening logs.
- `npm run perf` locally — prints the current metrics against the baseline,
  for the case where the Author wants to look rather than be told.

None of these show a trend until the baseline file has a history; the first
useful diff is the one described in follow-up 1 below.

Option 2 was rejected on the measurement above: the 20% best-case noise floor
sets a flake-free threshold higher than the regressions worth catching, and
`--compare` would not fail the build anyway. Option 3 is the only one that
would catch a constant-factor slowdown *within* an unchanged operation count,
and it is genuinely good at that — but it puts a third-party service, an
account and a token inside the gate of a one-Author project whose runtime
architecture is deliberately serverless, to cover a class of regression that
has not yet occurred here. It is recorded below as the escalation path, not
adopted now. Option 1 is the status quo the Author is asking to improve on.

**End-to-end timing inside the real webview was considered and rejected
outright.** The integration suite boots a real VSCode and could time a
keystroke through the actual **Writing surface** via the test-only message
channel (`src/domain/testProtocol.ts`). It would be the most faithful
measurement and the least trustworthy number in the project: an Electron
webview under `xvfb-run` on a shared runner is the noisiest environment
available here, on top of the 20% floor already measured in the quietest one.

### Consequences

- **Good:** the check resolves a single added parse or decoration — the exact
  granularity ADR 0001's findings needed and the wall-clock test could never
  provide.
- **Good:** it cannot flake. There is no timing in it, so it needs no repeated
  sampling, no median-taking, no `--no-parallelism`, and it is immune to the
  dead-code-elimination trap that silently broke the synthetic benchmark
  above — nothing is discarded, every number is asserted.
- **Good:** near-zero CI cost. The counters are microseconds of ordinary
  vitest, and the bundle bytes come from a build the gate already runs.
- **Good:** "did this feature make it slower?" is answered by `git log` on one
  file, with no service, no dashboard and no account.
- **Trade-offs:** **the counters are blind to constant-factor slowdowns.** A
  change that keeps the operation count identical but makes each operation 30%
  more expensive passes clean. This is the accepted, and deliberate, hole in
  the design; the wall-clock guard would only catch it once it became an
  order-of-magnitude problem.
- **Trade-offs:** exact-equality on bundle bytes means a dependency patch bump
  reddens the build over a few hundred bytes. Accepted knowingly, in exchange
  for never letting byte growth arrive unnoticed — a bump that adds 200KB and
  one that adds 200 bytes should both be seen, and only exact equality
  guarantees the first is never mistaken for the second.
- **Good:** the signal arrives before the commit exists, not a minute after it
  is on `main` — which matters precisely because this repository commits
  straight to `main` with no pull request in between.
- **Trade-offs:** the baseline can be updated to make a failure go away, and
  the hook can be skipped with `--no-verify`. There is no technical defence
  against either and none is proposed: with one Author committing to an
  unprotected `main`, every such defence is one the same person can lift. What
  the design guarantees is that neither happens *silently* — the baseline
  update is a line in the diff, and CI still fails on a skipped hook.
- **Trade-offs:** a third kind of test appears. CLAUDE.md and ARCHITECTURE.md
  describe **two levels** — pure-domain vitest units, and `@vscode/test-electron`
  integration. Bundle bytes are neither: they are a property of the build. This
  needs its own `npm run` script and its own gate step, because `test:unit`
  must not start depending on `dist/` having been built.
- **Follow-ups:**
  1. **Land this before ADR 0001's changes.** The baseline diff is then the
     record of that work landing: `parsesPerKeystroke` 3 → 1,
     `parsesPerCursorMove` 2 → 0, `extensionBundleBytes` ~597KB → ~180KB. Done
     in the other order, the improvement is invisible and the first baseline
     silently enshrines the fast numbers as if they had always been there.
  2. **Extract the fixture builder** now duplicated in
     `test/unit/livePreviewLatency.test.ts` into a shared module, so the
     counters and the latency guard describe the same Chapter. Two fixtures
     drifting apart would make the two tests incomparable.
  3. **Update ARCHITECTURE.md's "Two levels of tests" bullet** and CLAUDE.md's
     commands section for the third level and its script. This ADR cannot make
     that edit itself.
  4. **Escalation path, if a constant-factor regression ever slips through:**
     adopt instrumented CPU-level benchmarking (CodSpeed or equivalent, free
     for open source) as a separate decision. The trigger to revisit is a real
     slowdown that reached the Author with the counters green — not a
     scheduled review.
  5. **Revisit the hook if a second person ever contributes.** A pre-commit
     hook is per-clone and opt-in by nature; the moment the repository has
     contributors, protecting `main` and requiring the gate is the mechanism
     that actually holds, and this ADR's local-first choice should be
     re-examined rather than extended.
  6. **Add a metric per new hot path, not per new feature.** The set above
     covers what ADR 0001 measured; anything that starts running on every
     keystroke deserves a counter, and nothing else does, or the baseline
     becomes noise that gets updated without being read.

## Links

- `docs/adr/0001-incremental-shared-parse-and-lean-host-bundle.md` — the
  measurements this system makes repeatable, and the work whose landing the
  first baseline diff should record.
- `test/unit/livePreviewLatency.test.ts` — the existing wall-clock guard, its
  own comment explaining why it cannot be the per-commit signal.
- `.github/workflows/gate.yml` — the reusable gate this becomes a step in,
  shared by `ci.yml` and `release.yml`.
- `docs/PRODUCT.md` — PD-002, the reason a slow **Writing surface** is a
  product failure and not a technical detail.
