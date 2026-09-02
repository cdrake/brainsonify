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
| 04 | Bone rhythm | [`?experiment=04-bone`](https://cdrake.github.io/brainsonify/?experiment=04-bone) | tap rate ← boneness instead of opacity |
| 05 | Depth | [`?experiment=05-depth`](https://cdrake.github.io/brainsonify/?experiment=05-depth) | + tap brightness ← anterior–posterior |

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

`?experiment=03-rhythm` · `a7fc509`

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
report and not what the phrase "like bone" leads you to expect. Condition 04
keeps the tap layer and changes what drives it, so the two can be compared
directly.

**Result.** Not yet evaluated.

## 04 — Bone rhythm

`?experiment=04-bone` · `672eb3b`

Same three channels as 03, with one substitution: the tap rate follows
*boneness* rather than opacity. Pitch still tracks intensity and stereo still
carries anatomical left–right, so a listener switching between 03 and 04 hears
exactly one thing change.

**Intensity cannot find bone, so this looks at shape.** Cortical bone has no
signal on a T1 — there is nothing in its intensity to threshold, and 03 showed
that reading opacity gets the answer backwards. What is distinctive about the
skull is its *geometry*: a thin dark sheet, a few millimetres under the scalp,
wrapped around the head. That is a Hessian question. Eigenvalues of the
smoothed second-derivative matrix, sorted |λ1| ≤ |λ2| ≤ |λ3|, describe the local
shape; a dark plate is the case where λ3 is large and positive while the other
two are small, giving a plateness of (|λ3| − |λ2|) / |λ3|, gated by the
Frobenius norm so flat noise does not qualify.

**Plateness alone does not work, and the reason is the interesting part.**
Sulcal CSF is *also* a thin dark sheet a short distance under the surface, and
it scores just as well — the first version rattled across the whole cortex. The
difference is orientation: the skull lies parallel to the scalp, while sulci cut
inward at every angle. Computing depth from the scalp with an exact Euclidean
distance transform gives a field whose gradient **n** is the local "outward"
direction, and nᵀHn is the curvature the plate presents along that direction.
Dividing by |λ3| asks how much of the sheet's normal points the way the head's
own surface does. A skull answers ≈ 1, a sulcus ≈ 0. No eigenvectors are needed
for this — the quadratic form expands directly from the six Hessian components.

**Calibrated against volumes, not against itself.** The raw response is mapped
through a fixed `[0.05, 0.25]` window. The obvious alternative, normalising each
map by its own maximum, is wrong in a way worth naming: it would make a
skull-stripped volume rattle exactly as hard as a whole head, since something
is always the maximum. Measured over the shell band:

```
                     >0.05    >0.1     >0.15
chris_t1 (skull)     2.477%   0.941%   0.386%
mni152   (stripped)  0.043%   0.001%   0.000%
```

Roughly a 900-fold separation at 0.1. The floor sits above where a skull-free
volume has died out; the peak where a real vault still has voxels to spare. Load
MNI152 in this condition and it stays quiet, which is the correct report.

The map is built once per volume on a half-resolution copy, in a worker, taking
about a second — the whole point of doing it off the main thread is that a
pointer hover cannot wait for it.

**The rate is shaped, not spread.** 03 maps its driver evenly across the range,
which is right for opacity: opacity is a quantity, and every value in the middle
means something. Boneness is not a quantity, it is an answer to a yes-or-no
question, and the thin band of half-answers on either side of the vault is the
least informative part of it. Spread evenly, the skull came out around 9× the
soft-tissue rate and the boundary arrived as a gradual accelerando — audible,
but nothing you could point at. So boneness now goes through a logistic
(`contrast`) before becoming a rate, and the rate spends a wider, faster range,
`BONE_TAPS` = 1.2/s to 22/s.

22/s is deliberately at the edge of fusion, where a click train stops being
countable and turns into a flutter. 03 explicitly stays below that line; 04
crosses it on purpose, because it makes bone *categorically* different from soft
tissue rather than merely faster than it, and the two are then hard to confuse
even in passing. The collision 03 was worried about does not arise: a 22 Hz
flutter is more than two octaves below the pitch channel's 110 Hz floor. The
logistic keeps soft shoulders rather than being a hard threshold, so a pointer
resting on the boundary settles instead of chattering between two rates.

**Measured through the vault**, inward from air on `chris_t1`:

```
                            spread (03's curve)   shaped (04)
air              0   0.00        1.5 /s              1.2 /s
scalp fat      165   0.00        1.5 /s              1.2 /s   ← 03 taps this fastest
outer table     16   0.00        1.5 /s              1.2 /s
inner shoulder  35   0.42        3.8 /s              3.9 /s
diploë          43   0.89       11.0 /s             21.8 /s
cortical bone   19   0.97       13.2 /s             22.0 /s   ← fastest, as intended
inner table     73   0.40        3.6 /s              3.2 /s
white matter    94   0.00        1.5 /s              1.2 /s
```

Shaping widens the full spread from 9× to 18×, but the number that matters is
the step *across the boundary*: 3.9/s to 21.8/s between one voxel and the next.
Confirmed live through the app's own pick path — vault reads 21.9–22.0/s, brain
1.2/s.

**The inversion against 03 is the result.** On the same voxels, 03 taps 12.4/s
in white matter and 2.2/s at the vault; 04 taps 1.2/s in white matter and 22/s
at the vault. Switching between the conditions with a volume loaded changes
nothing else, which is what makes it a comparison.

**Sampling it at a point is the right measurement and the wrong instrument.**
The shell is thin enough that hovering it is luck — 49 of 46,224 raster points
— and on the 3D render the depth pick resolves to the scalp, with the skull
underneath it, so the view this channel was built for could not sound bone at
all. `Spike` gives the probe a reach, and the tapping reports the densest bone
within it:

```
spike    points reporting bone    scalp reaches skull    cortex also reporting
 0 mm         49 / 46,224              0 / 396               0 / 12,243
 4 mm        523                      12 / 396             163
 8 mm      2,616                     129 / 396           1,168
12 mm      4,218                     164 / 396           2,060
```

8mm is the default because the vault sits 5.3-7.9mm under the outer scalp on
this volume, so a shorter reach only just arrives. The last column is not an
error: a cortical voxel 8mm from the inner table really is within 8mm of bone.
Lengthening the probe trades the sharp boundary for a findable one, which is
why it is a control rather than a constant — and why 0 is kept, since that is
the honest measurement to check the filter against.

**Two controls exist for judging it.** `Rate` multiplies the whole rhythm
without touching the ratios in it, because comparing two rates means counting
taps and counting is slow at the bottom of the range; at 3x the vault runs 65.8/s
against brain at 3.6/s, the same contrast delivered in a third of the time. The
tap envelope shortens automatically as the rate climbs, so the fast end stays a
train of strikes rather than collapsing into noise. `Taps only` mutes the tone,
leaving the density channel alone with the listener — useful for learning what
the rhythm says before putting pitch back on top of it.

**What to listen for.** Sweeping down through the top of the head should give a
brief flutter bracketed by slow ticks on either side — scalp outside, brain
inside. The shell is thin, some four to seven millimetres: a raster of the 2D
tiles put 52 of 73,616 sample points at boneness ≥ 0.8. Whether that is
*findable* by ear, rather than merely present once found, is the open question,
and the flutter is meant to help — a distinctive texture is easier to sweep for
than a slightly quicker tick. Use `Clip` to reach the skull's inner face on the
3D render.

**Open question.** Boneness is a derived, unitless quantity, unlike intensity
and position which the listener can reason about directly. It may be that the
honest framing is not "bone" but "this surface is shaped like the outside of
your head", and that a listener has no way to check it.

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

---

## 05 — Depth

`?experiment=05-depth` · `672eb3b` · **default**

### What it maps

Everything 04 maps, plus front-back position on the tap itself. The rate still
says what the tissue is; the *colour* of the strike says where it sits along the
anterior-posterior axis. An anterior tap is struck through a band an octave above
the neutral 1800 Hz and reads bright and clicky; a posterior one an octave below
and reads dull and woody. `Depth` scales the field the way `Stereo` scales the
pan, and flattens it entirely at 0.

Stereo is unchanged and still carries left-right, so the two spatial channels are
independent: collapsing one does not touch the other.

### Why brightness and not panning

Front-back is the one axis stereo cannot carry. A source 30° ahead and a source
30° behind produce the same interaural time and level difference — the cone of
confusion — so any amount of panning leaves them identical. What resolves it in
life is the pinna, which filters sound arriving from behind, and that is a
spectral cue rather than a positional one.

A tap is the right thing to hang it on. It is a broadband noise burst, so moving
the band it is struck through changes its whole character; a sustained sine
would merely shift in hue. The mapping is geometric about the neutral band, for
the same reason pitch is: a timbral step is heard as a ratio, and a linear
mapping would crowd every audible difference into the anterior half.

An octave either way is the whole range. Widening it would buy contrast by
sinking the posterior end into the pitch channel's territory, which the tap layer
was deliberately placed above.

### What to listen for

Sweep the sagittal tile from occiput to forehead with **Taps only** on. Measured
through the app's own sampling path on `chris_t1`:

```
world Y     readout      tap band
 -97 mm     P 86%          992 Hz
 -57 mm     P 43%         1336 Hz
 -17 mm     centre        1800 Hz
 +23 mm     A 43%         2425 Hz
 +51 mm     A 71%         2944 Hz
```

The world coordinates and the readouts are measured; the band is `tapBand()`
evaluated at them, so it inherits their rounding.

The volume spans -111 to +78 mm front to back, so the ends of the head reach the
ends of the range.

### Result

_Not yet run with listeners._

### Still open

- Does brightness survive being heard at the same time as the rate, or does a
  fast flutter mask its own colour? The two share one strike, which is either
  economical or a collision.
- Superior-inferior is still unmapped. Pitch is spoken for by intensity and rate
  by density, so the third axis has no free dimension left — and a listener who
  cannot see the crosshair has no other way to get it.
- Whether front and back are told apart *absolutely* or only relatively. Nothing
  here anchors "bright" to "anterior" except practice.
