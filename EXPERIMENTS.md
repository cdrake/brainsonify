# Experiments

Each experiment is one condition: a named set of sensory channels the app maps a
volume onto. They all ship in the same build. Visiting the site with no
experiment in the URL gives the most recent one; the switcher at the top of the
panel links to the earlier ones.

| # | Condition | Link | Channels |
|---|---|---|---|
| 01 | Pitch only | [`?experiment=01-pitch`](https://cdrake.github.io/brainsonify/?experiment=01-pitch) | pitch ← intensity |
| 02 | Stereo | [`?experiment=02-stereo`](https://cdrake.github.io/brainsonify/?experiment=02-stereo) | pitch ← intensity, stereo ← anatomical left–right |
| 03 | Rhythm | [`?experiment=03-rhythm`](https://cdrake.github.io/brainsonify/?experiment=03-rhythm) | + tap rate ← opacity |

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

`?experiment=02-stereo` · `9caa560`

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

## 03 — Rhythm

`?experiment=03-rhythm` · **default**

Adds a tap layer whose rate follows opacity: how much of a voxel the renderer
actually shows, read off the alpha channel of the active colormap at the voxel
the sampler already resolved. No second ray is cast — the pick has happened, and
opacity is a 256-entry table lookup at that intensity.

The rate spans 1.5/s to a `Taps` slider default of 14/s, geometrically, because
tempo is heard as a ratio. The ceiling stays under the ~20/s where a click train
fuses into a buzz with a pitch of its own and collides with the channel already
carrying intensity. The taps are struck at a fixed 1800 Hz for the same reason,
and are scheduled on the audio clock a tenth of a second ahead, so the rhythm
does not jitter with the pointer's event rate.

**Opacity is scaled to the colormap's own peak.** NiiVue's `gray` ramps alpha
only to 128/255, so absolute alpha never exceeds 0.5 and the fast half of the
range would be unreachable — the most opaque thing in the volume would rattle at
a third of the rate the scale was built for. `relativeOpacity` divides by the
LUT's peak, which preserves the *shape* of the alpha ramp, its plateaus and its
threshold, while spending the whole range on whatever is loaded. Under a plain
linear colormap this makes opacity numerically equal to normalised intensity;
the two only separate once a display window or a non-linear alpha ramp is in
play, which is exactly the case the channel exists for.

**What to listen for.** Whether tap rate and pitch stay separable when they
mostly agree, and whether they are still separable when they disagree — narrow
the display window and the taps saturate while the pitch is still climbing.

**Bone is the wrong intuition on T1.** This condition was specified as "faster
tapping on more opaque surfaces (like bone)", and the mapping does that, but on
a T1 MRI cortical bone is a signal void: it is the *darkest*, most transparent
thing in the head. Probing down the midline of `chris_t1` bears this out —
scalp fat taps fastest at 13.3/s, and the skull itself is the slowest thing in
the profile at the 1.5/s floor:

```
scalp fat      134  opacity 0.98   13.3 /s
diploë          88  opacity 0.61    5.9 /s
cortical bone   12  opacity 0.00    1.5 /s   ← slowest, not fastest
white matter   125  opacity 0.91   11.4 /s
```

Bone rattling would need CT, where density is what the intensity means. On MRI
the channel reports what the renderer shows, which is the honest thing for it to
report and not what the phrase "like bone" leads you to expect.

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
