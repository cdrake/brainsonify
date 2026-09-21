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
| 06 | Height | [`?experiment=06-height`](https://cdrake.github.io/brainsonify/?experiment=06-height) | + loudness window ← inferior–superior |
| 07 | Texture | [`?experiment=07-texture`](https://cdrake.github.io/brainsonify/?experiment=07-texture) | voice ← white noise, brightness ← intensity (replaces pitch) |
| 08 | Regions | [`?experiment=08-regions`](https://cdrake.github.io/brainsonify/?experiment=08-regions) | + the AAL region under the pointer is spoken |
| 09 | Coronal cut | [`?experiment=09-coronal`](https://cdrake.github.io/brainsonify/?experiment=09-coronal) | + opens already cut to the medial coronal plane |
| 10 | Radar sweep | [`?experiment=10-sweep`](https://cdrake.github.io/brainsonify/?experiment=10-sweep) | + a sweep reads the cut face on its own, line by line |
| 11 | Fast lines | [`?experiment=11-fast-lines`](https://cdrake.github.io/brainsonify/?experiment=11-fast-lines) | the same sweep, each line a half-second gesture with a rest after it |

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
repeating dip at every sulcus: CSF-dark trough, gray-matter crown.

**What it cannot do.** Two voxels of equal intensity on opposite sides of the
head are indistinguishable. There is no way to tell a left-hemisphere sweep from
a right-hemisphere one, which makes "go to the structure I named" impossible.

**Result.** Not yet evaluated.

## 02 — Stereo

`?experiment=02-stereo` · `9caa560`

Adds stereo panning driven by world X in millimeters, so the left hemisphere
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
skull is its *geometry*: a thin dark sheet, a few millimeters under the scalp,
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
inside. The shell is thin, some four to seven millimeters: a raster of the 2D
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

`?experiment=05-depth` · `672eb3b`

### What it maps

Everything 04 maps, plus front-back position on the tap itself. The rate still
says what the tissue is; the *color* of the strike says where it sits along the
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
 -17 mm     center        1800 Hz
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
  fast flutter mask its own color? The two share one strike, which is either
  economical or a collision.
- Superior-inferior is still unmapped. Pitch is spoken for by intensity and rate
  by density, so the third axis has no free dimension left — and a listener who
  cannot see the crosshair has no other way to get it.
- Whether front and back are told apart *absolutely* or only relatively. Nothing
  here anchors "bright" to "anterior" except practice.

---

## 07 — Texture

`?experiment=07-texture` · `ec159e5`

### What it maps

Everything 06 maps, with one substitution: the continuous voice becomes
unpitched. Instead of a sine (01) or pink noise banded around the mapped
frequency (the existing `Filtered noise` mode), `Texture` runs flat white
noise through a lowpass filter whose cutoff tracks normalised intensity —
dull and muffled at the low end, an open hiss at the top. Stereo, the bone
rhythm, tap brightness, and the height loudness window are all unchanged from
06; only what the base voice sounds like has moved.

White noise rather than reusing the pink noise the taps and `Filtered noise`
already use, so the voice and the taps differ in color as well as in rhythm —
two cues for telling them apart, not one, since the whole point of the
condition is to make the tapping legible against the voice rather than fused
with it.

### Why brightness, not loudness

Loudness is already spoken for: 06 rides it for inferior-superior position.
Doubling it up for intensity would mean two facts sharing one dimension, which
is the same collision the front-back channel was built to avoid on the pan
axis. Brightness — the lowpass cutoff — was open.

### Why this, and not just "quieter tone"

The motivating problem was that the pitched voice in every earlier condition
has a tonal center, and a listener's attention keeps landing on pitch changes
even when the rhythm is the thing meant to carry the tissue signal. A lowpass
has no resonant center the way pitch, or even the existing bandpass `Filtered
noise` mode, does — there is nothing here that should read as a note. The
hypothesis is that an unpitched bed leaves more room to hear the taps as a
foreground event, "in the background" of a texture rather than competing with
a second pitch.

### What to listen for

Whether the bone rhythm is easier to follow under `Texture` than under `Pure
tone`, especially at the vault boundary from 04 where the rate itself is doing
most of the work. Whether the cutoff sweep still carries the sulcal-dip cue
from 01, now as a change in hiss rather than a change in note.

### Result

_Not yet run with listeners._

### Still open

- Loudness is not compensated for the lowpass's own bandwidth: a wider
  passband admits more of a flat spectrum, so the raw signal gets louder as
  the cutoff opens, independently of whatever `loudnessGain` does for ear
  sensitivity. This is unmeasured — see the equivalent note in
  `libs/sonification/src/audio.ts`.
- The lowpass's default cutoff span (110 Hz to the same octave range as the
  pitch conditions) was carried over from `frequency()` unchanged. Whether
  that span is the right one for a filter cutoff, as opposed to a pitch, has
  not been checked by ear.
- Whether unpitched noise actually reads as "background" the way the
  hypothesis expects, or whether continuous broadband noise is just as
  attention-grabbing as a tone, only louder in a different way.

---

## 08 — Regions

`?experiment=08-regions` · `ec159e5`

Condition 07, with the region under the pointer named out loud when the
pointer enters it. Everything else is unchanged: texture for intensity, the
bone rhythm with its front-back brightness, loudness for height.

### What it maps

The world position of the sampled voxel, looked up in the AAL atlas, to a
spoken name. The atlas is NiiVue's own copy of AAL, in MNI space, fetched at
runtime and never shown: it is read through its own affine, so the scan's
grid does not have to match it. Label 0 is unnamed. A name is spoken once the
pointer has rested in a region for a moment, and a sweep straight across says
nothing. The name is also written into the `region` readout row.

The lookup is on for the MNI152 demo and for a file dropped in, which is
assumed to be in MNI space, and off for the whole-head T1, which is not.

### Why a word, and not a sound

Every earlier channel carries a quantity or a position, and each found a
dimension of sound to carry it. A region name is neither: it is one of a
hundred-odd categories, and there is no dimension of sound with that many
distinguishable steps that a listener could learn in a session. Speech is the
one channel that already has the vocabulary. The cost is that it competes
with the rest for attention, which is why it is said once on entry and not
repeated.

### What to listen for

Whether a name over the texture and the taps is heard as a label for what
the ear is already following, or whether it stops the listening while it is
said. Whether the dwell is short enough to feel like a response and long
enough that a sweep stays quiet. Whether "left" and "right" in the name agree
with which ear the tone is in.

### Result

_Not yet run with listeners._

### Still open

- The dwell before a name is spoken was chosen, not measured. The right
  value is whatever separates "passing through" from "stopped here", and only
  listening will say what that is.
- The spoken name keeps AAL's word order after the side, so it says "frontal
  superior" where an anatomist would say "superior frontal gyrus". Whether
  that reads, or whether the names need a hand-written table, is untested.
- The sound key has no step for the atlas, since the atlas explains itself
  the first time it speaks. Whether it should still be announced is open.
- A dropped-in file is assumed to be in MNI space. There is no check, and a
  scan that is not will be labelled with confidence.

---

## 09 — Coronal cut

`?experiment=09-coronal` · `206792f`

Condition 08, with one change to how a session starts rather than to what
anything sounds like: the scan opens already cut to the medial slice of the
coronal plane instead of whole. Texture for intensity, the bone rhythm with
its front-back brightness, loudness for height, and the spoken region name
are all unchanged from 08.

### What it maps

Nothing new sonically — no channel is added or altered. What changes is the
starting state of NiiVue's own clip plane, set once on load via its public
`setClipPlane([depth, azimuth, elevation])` API to `[0, 0, 0]`: depth zero is
the midline itself, and azimuth 0 / elevation 0 is the same plane NiiVue's
own POSTERIOR preset uses. A visitor lands here already; pressing `c` once by
hand would have gotten them to the same place anyway. After that, the plane
is theirs to move: the mouse wheel over the 3D render nudges its depth, and
`c` cycles NiiVue's own six anatomical presets and off, exactly as it always
has. Nothing about wheel or keyboard handling is touched.

### Why a fixed start, and not free 3D hovering alone

Every earlier condition opens on the whole, uncut volume, and left it to
whoever is at the mouse to discover that a clip plane exists at all — it is
a NiiVue feature, not something this app surfaces on its own. For a sighted
technician guiding a listener who cannot see the screen, starting whole and
figuring out clipping live during a session is one more thing to manage
while also narrating position. Opening pre-cut to a plane that is already a
recognizable anatomical landmark — straight down the middle, front from back
— gives the technician a known place to start describing from, and a
`TECHNICIAN.md` guide at the repo root now documents the rest of that
workflow: what to click before the listener sits down, how the wheel and `c`
differ, and how to narrate a pass.

### Why its own condition, and not a change to 08

The first attempt at this folded the fixed start into every condition's
shared `refreshRange()`, which would have moved 01 through 08 out from under
themselves — conditions that had already been described, and in 08's case
run, on the assumption of an uncut open. Keeping each prior condition exactly
as it was is the same reason 02 through 08 each exist as their own entry
instead of overwriting the one before: the log is the record of what was
tried, not just of what is current.

### What to listen for

Whether starting already cut changes how quickly a first-time listener
orients, compared to 08's uncut open, given the same technician narration.
Whether the fixed coronal start is in fact the anatomical plane a technician
reaches for first, or whether sagittal or axial would be a more natural
landing point for most of what gets demonstrated.

### Result

_Not yet run with listeners._

### Still open

- The medial coronal plane was picked because it is NiiVue's own POSTERIOR
  preset at depth zero, not because it was tested against sagittal or axial
  as a starting cut. Whether front-to-back is the most useful first
  orientation, versus left-right or top-to-bottom, is untested.
- `TECHNICIAN.md` has not been run with an actual sighted technician guiding
  an actual visually-impaired listener; it is written from reading NiiVue's
  own controls, not from watching a session.
- The pre-existing `Clip` slider in the side panel is untouched and still
  camera-relative, now sitting alongside a second, plane-relative way to cut
  the volume. Whether having both is confusing in practice, or whether the
  slider should be hidden while a fixed clip plane is active, is open.

## 10 — Radar sweep

`?experiment=10-sweep` · `206792f`

Condition 09, with one addition to how a session is driven rather than to
what anything sounds like: a **Start radar sweep** button that reads the cut
face on its own. Texture for intensity, the bone rhythm with its front-back
brightness, loudness for height, the spoken region name and the medial
coronal opening cut are all unchanged from 09.

### What it maps

Nothing new sonically — no channel is added or altered. What changes is who
is moving. Pressed, the sweep walks the face of the clip plane the way a page
is read: left to right along one line, then the next line down, and from the
bottom line back to the top, looping until pressed again. Every point it
lands on is sampled through the same path a crosshair step uses and sounded
through the same path a hover is, so the bone spike's reach is in play the
whole way: a line across soft tissue still taps where bone sits within the
`Spike` distance behind the face. The crosshair follows the sweep on every
tile, and the magenta scan line is drawn only as far along the current line
as the sweep has got, so a technician can see where the sound is coming from
even where there is no bone for the spike to mark. Hovering is ignored while
it runs.

The face is read from NiiVue's own clip plane afresh every frame, so the
wheel and `c` still work mid-sweep and the sweep goes with the plane: nudge
the coronal cut deeper and the next line is read off the new depth; press
`c` and the sweep reads the sagittal or axial face instead. On a sagittal
cut a line runs back to front, since it has no left-right of its own; on an
axial cut the lines run front to back, with the front at the top. With no
plane set at all the sweep reads the coronal plane through the crosshair.

The pace is 4 seconds per line and twenty-one lines from the top of the
face to the bottom, both included, which is 84 seconds for a whole face.
(First written up as twenty lines and eighty seconds; the count was off by
one, since both edges are read.) The pace was two constants in `main.ts`
when 10 was committed, and is now three sliders under the sweep button, set
to these values on entering 10. Those are first guesses. Nothing has been
listened to at any other setting.

### Why a sweep, and why its own condition

Every earlier condition puts the listener's hand on the mouse, or a
technician's. Both make the listener responsible for where the sound comes
from as well as what it means, and a first-time listener has no map to aim
with. A sweep takes the aiming away: the whole face arrives in a fixed order
at a fixed pace, and the listener's only job is to notice what changes from
line to line. Whether that is easier or just slower is the question.

It is its own condition for the reason 09 is: 01 through 09 were described,
and in 08's case run, without a sweep button in the panel, and the button
appears only here, so none of them moves.

### What to listen for

Whether the skull reads as a shape. On a coronal face the vault is a ring, so
a line near the top should tap twice, close together, and a line through the
middle of the head should tap once near each end with soft tissue between.
Whether the ventricles, the corpus callosum and the temporal lobes register
as changes in the texture from one line to the next, and at what pace they
stop registering. Whether a listener can say, unprompted, roughly how far
down the face the sweep is.

### Result

_Not yet run with listeners._

### Still open

- 4 seconds a line and twenty-one lines to a face are guesses. A line takes
  as long as it takes to hear, and a face should not take so long that the
  top of it is forgotten by the bottom. Both want tuning by ear; they are
  sliders now, and 11 is the first other setting tried.
- A line is a run of single voxels, heard one after another. Whether a line
  of tissue should instead be heard all at once, as one sound, is a design
  question that this condition does not answer; see NOTES.md Entry 13 for
  the options.
- The sweep covers the middle unit square of a tilted plane rather than its
  whole extent, so on the camera-relative `Clip` slider's plane it can read
  air, or nothing, at the ends of a line. The six anatomical presets are the
  intended use.

## 11 — Fast lines

`?experiment=11-fast-lines` · `971a69e` · **default**

Condition 10 at a different pace, and nothing else: the same coronal opening
cut, the same channels, the same sweep over the same twenty-one lines. Each
line now takes half a second instead of four, and is followed by 0.3 seconds
of silence before the next line starts, so a face goes by in about
seventeen seconds instead of 84.

### What it maps

Nothing new sonically. The sweep still samples one voxel at a time through
the same path a hover does, so the bone spike's reach, the texture, the
stereo, the front-back tap color and the height loudness are all as they
were. What changes is that a line is now heard as one short run rather than
a walk: the tissue along it becomes a contour, the bone taps become clicks
inside that contour, and the rest between lines is what says "next line".
At a half second per line and roughly sixty frames a second, a line is
about thirty samples, so on the MNI152 demo each sample is a few
millimeters apart. The pace is the three sliders under the sweep button,
set to 0.5 s, 21 lines and 0.30 s rest on entering 11.

### Why this pace, and why its own condition

This is the "line as a fast gesture" option from NOTES.md Entry 13: of the
ways to hear a whole line of tissue rather than one voxel after another,
it is the smallest step from 10, since it keeps every mapping the listener
has already learned and changes only the clock. Whether a line read that
fast still carries the tissue pattern, or blurs into a glissando the way a
fast hover does, is exactly the question. The rest between lines is there
so that a line has a beginning and an end; without it, at this pace, one
line would run into the next and the face would be a single continuous
sound.

It is its own condition rather than a change to 10 because 10 was
described, and its sliders set, at the slow pace; a listener comparing the
two should be able to switch between them and hear only the pace change.

### What to listen for

Whether the vault still reads as two clicks near the top and one at each
end through the middle when a line is half a second long. Whether a line
through the ventricles sounds different from a line above them at this
pace. Whether the rest is long enough to count lines by, and whether
seventeen seconds is short enough that the top of the face is still in mind
at the bottom.

### Result

_Not yet run with listeners._

### Still open

- Half a second and 0.3 seconds of rest are guesses. Faster still, with a
  face in under ten seconds, is the direction if lines still read.
- At this pace the sweep is sampling at the frame rate, so the number of
  voxels per line depends on the machine. A line scheduled on the audio
  clock, with a fixed number of samples, would be the honest version of a
  fast gesture; this one is the cheap version.
- The other line encodings in Entry 13 (the line as a chord, as edges, as a
  mix) are untried.
- The lines can run in any of the four cardinal directions (the `Lines
  run` control): across the face either way, or down it either way. Both
  10 and 11 open reading left to right; the others are a control to try,
  not yet a condition.
