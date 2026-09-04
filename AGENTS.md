# Instructions for agents working in this repository

## The three prose files, and which one a thing goes in

- **`README.md`** — documentation. What the app is, how to run it, how the
  mechanisms work. Written for someone who has never seen the repo. Present tense,
  no history.
- **`EXPERIMENTS.md`** — the experiment log. One section per condition: what it
  maps, what to listen for, what it showed, what is still open. Add a section when
  a condition is added; fill in **Result** when there is one.
- **`NOTES.md`** — the development journal. Why the project is shaped the way it
  is, what it might have been instead, and what was abandoned. Append-only.

If a fact belongs in more than one, put the mechanism in the README, the
measurement in EXPERIMENTS.md, and the *decision* in NOTES.md, then cross-link
rather than duplicating.

## Writing a journal entry in NOTES.md

`NOTES.md` is personal notes for Chris. It is **not a graded assignment and not a
course deliverable** — do not apply course submission rules, disclosure lines, or
academic framing to it.

Add an entry when a session produced a design decision, a ruled-out option, a
change of direction, or a discovery that changed how the problem is understood.
Routine commits do not need one. A refactor does not need one. Learning that
condition 03 got bone backwards does.

Append to the bottom. **Never rewrite or reorder existing entries** — being able to
see how the thinking changed is the point of keeping it. Fixing a typo is fine;
revising past reasoning to match present understanding is not. If an earlier
decision turned out to be wrong, say so in a new entry and leave the old one
standing.

Shape:

```markdown
---

## Entry N — D Month YYYY

### One-line subject

... prose sections ...
```

Cover whichever of these the session actually produced. Skip the rest.

- **What was built.** Short. The code is in the repo; do not restate it.
- **Decisions made**, each with its reasoning. The reasoning is the payload.
- **Ruled out, with reasons.** Equal weight to the decisions. Knowing why an
  approach was abandoned is what stops it being reconsidered from scratch in
  November.
- **Implementation notes** — only what was surprising or cost real time. API
  quirks, undocumented behavior, wrong turns. Not a changelog.
- **Open questions**, phrased as questions.
- **Next.** Concrete actions, not aspirations.

### Rules

**Record the why, not the what.** A reader six weeks out can read the code and
cannot reconstruct why one approach beat another. If a paragraph would still be
true after reading the diff, it probably belongs in the README instead.

**Never invent technical detail.** Do not supply a number, a parameter, an API
behavior, or a measurement that Chris did not state and that is not verifiable in
the repo. Where a specific is missing, leave an explicit placeholder:

```markdown
> _To fill in: whether the boneness map is rebuilt when the colormap changes._
```

A plausible guess becomes indistinguishable from fact once it is written down.
Numbers quoted in an entry should come from a measurement that was actually run,
and should say what volume they were measured on.

**Say when something is unvalidated.** No condition has been run with listeners.
Design reasoning and instrumented measurement are not evidence, and entries should
not blur the two.

**Write in Chris's register.** Plain declarative prose. Understated. No marketing
language, no "exciting", no "leverage", no bulleted summaries where a paragraph
works. "The retreat turned out to be productive" is the tone.

**Date entries correctly.** Check the actual date rather than assuming, in the
timezone the work happened in.

**Ask before guessing at motive.** If it is unclear why something was done, ask
rather than construct a rationale.

## The nightly draft

A scheduled task appends a draft entry each evening when there are commits that
day. It works from `git log` and the diff, which tell it what changed and never
why, so it fills the reasoning sections with placeholders like:

```markdown
> _To fill in: why the tap envelope shortens rather than the rate being capped._
```

Those placeholders are the point. They are questions waiting for an answer, not
omissions to be tidied away. Do not delete one by inventing a rationale that fits
the diff — either Chris answers it, or it stays.

An entry that is still mostly placeholders is a draft. It is fine to leave it that
way; it is not fine to make it look finished.

## Project conventions

- Bun 1.2+ and Nx. `bun run dev`, `build`, `test`, `typecheck`. Nx caches, so a
  no-op build is a cache hit, not a rebuild.
- `libs/sonification` is framework-free: pure TypeScript, no DOM and no NiiVue
  import. That is what makes the mapping unit-testable, and it is worth
  protecting — if something needs the canvas, it belongs in `apps/brainsonify`.
- `apps/brainsonify/src/experiments.ts` is the single source of truth for
  conditions: the switcher links, the default, and which controls are visible all
  come from it. Append new conditions rather than inserting, since the last entry
  is what a visitor gets by default.
- A new channel needs a flag in `Channels` and `data-requires="<channel>"` on the
  controls and readout rows it owns. Nothing else should need to know it exists.
- The crosshair is deliberately not moved during 2D hover sampling. Depth picking
  on the render tile does move it, and that is intentional feedback.
- Demo volumes are fetched at runtime from `niivue.github.io` and are not stored
  in the repo. Keep it that way.
- Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
  Vite uses `base: "./"` so the bundle works from any subpath.

## Committing

Do not commit on Chris's behalf unless he asks. The journal included — an entry
appended by the nightly task is left in the working tree for him to stage with
whatever else he is committing.
