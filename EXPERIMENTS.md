# Experiments

Each experiment is one condition: a named set of sensory channels the app maps a
volume onto. They all ship in the same build. Visiting the site with no
experiment in the URL gives the most recent one; the switcher at the top of the
panel links to the earlier ones.

| # | Condition | Link | Channels |
|---|---|---|---|
| 01 | Pitch only | [`?experiment=01-pitch`](https://cdrake.github.io/brainsonify/?experiment=01-pitch) | pitch ← intensity |
| 02 | Stereo | [`?experiment=02-stereo`](https://cdrake.github.io/brainsonify/?experiment=02-stereo) | pitch ← intensity, stereo ← anatomical left–right |

The registry that drives all of this is `apps/brainsonify/src/experiments.ts`.
It is the single source of truth: the switcher links, the default condition, and
which controls are visible all come from it.

## Why one build rather than a branch per experiment

Keeping each condition on its own branch or in its own app would freeze the
earlier ones, which sounds like the safer choice for a study and is not. The
sampler is still wrong in ways we have not found yet, and a fix that only lands
on the newest branch means condition 01 and condition 02 stop differing solely
in the thing under test. One build keeps the shared machinery genuinely shared,
so the only difference between two conditions is the channels they enable.

The cost is that a change to the shared code changes every condition, including
ones already run. That is the right trade while the mapping is unvalidated;
it stops being the right trade the moment real participant data exists, and at
that point the honest move is to tag the commit each session ran against.

---

## 01 — Pitch only

`?experiment=01-pitch` · last its own `HEAD` at `55390a3`

Pitch tracks voxel intensity across a configurable span of octaves. One mono
voice. Hovering carries no information about *where* in the volume the sound
came from; the listener has only the pointer, which is no help at all to
someone who cannot see the screen.

**What to listen for.** A lateral sweep across the cortical ribbon should give a
repeating dip at every sulcus: CSF-dark trough, grey-matter crown.

**What it cannot do.** Two voxels of equal intensity on opposite sides of the
head are indistinguishable. There is no way to tell a left-hemisphere sweep from
a right-hemisphere one, which makes "go to the structure I named" impossible.

**Result.** Not yet evaluated.

## 02 — Stereo

`?experiment=02-stereo` · `9caa560` · **default**

Adds stereo panning driven by world X in millimetres, so the left hemisphere
sounds in the left ear. A `Stereo` slider scales the field from mono to
hard-panned, and the readout names the side.

The axis is anatomical, not screen-relative. Panning by pointer position would
swing the hemispheres across the stereo image every time the render is rotated,
and would only tell the listener what their own hand already told them.

**What to listen for.** Whether a lateral sweep now reads as *movement across
the image* rather than as pitch alone, and whether the sulcal dips stay audible
once position is competing for attention.

**Open question.** Stereo needs both ears, which is a constraint on the
bone-conduction transducer the longer-term plan depends on.

**Result.** Not yet evaluated.

---

## Adding an experiment

1. Append an entry to `EXPERIMENTS` in `apps/brainsonify/src/experiments.ts`.
   The last entry is what a visitor gets by default, so append rather than
   insert.
2. If it turns a new channel on, add the flag to `Channels`, and mark the
   controls and readout rows it owns with `data-requires="<channel>"` in
   `index.html`. Nothing else needs to know the channel exists — `applyChannels`
   hides whatever the active condition does not use.
3. Add a section here, and record the result once there is one.
