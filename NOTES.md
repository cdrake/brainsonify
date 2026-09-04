# brainsonify — Development Journal

ITEC 444, Fall 2026 · Christopher Drake · University of South Carolina

A record of design decisions, ruled-out options, and the reasoning behind both.
Kept because the reasoning is worth more than the code and evaporates faster.

Entries are append-only, newest at the bottom. `CLAUDE.md` says how they get
written.

This file is the *history* of the project: why it is shaped the way it is, and
what it might have been instead. It is not the experiment log — that is
[EXPERIMENTS.md](EXPERIMENTS.md), which records what each condition maps and what
it showed — and it is not documentation, which is the README.

## The project in one paragraph

Medical and scientific imaging is almost entirely visual. Someone who cannot see
the screen has no practical way to explore a 3D scan. brainsonify turns pointer
position over an MRI into sound, so that moving across the anatomy produces a tone
tracking the tissue underneath. The longer aim is to pair that audio with a
bone-conduction transducer so the signal is felt as well as heard, and to add
spoken structure labels so a user can tell where they are, not just what they are
touching.

---

## Entry 1 — 31 August 2026

### Scoping, feasibility, and a first working spike

**What was built.** A single-page prototype on top of NiiVue 0.69. Hovering the
pointer over any 2D slice reads the voxel intensity underneath and maps it to
pitch through Web Audio. Hovering the 3D render does the same by depth-picking the
surface. No clicking, no build step, runs from a static host or the filesystem.
Committed as a repository with the NiiVue bundle vendored so it has no runtime
dependencies.

### The central design question

Sonification alone conveys texture but not location. You can hear that you crossed
something without knowing what it was. Getting a pointer to a named structure
without being able to see the render is the harder and more interesting problem,
and it is where the actual contribution lies. Screen readers solved this for 2D
documents with headings, landmarks and skip links. Nothing equivalent exists for a
3D volume.

### Decisions made

**Web, not iPadOS.** The rendering already exists in NiiVue, which runs in a
browser. That removes the hardware constraint on who can participate in an
evaluation and gives Web Audio for the continuous channel.

**Volume directly, not a mesh.** Sampling voxel intensity needs no surface
extraction. On a T1 this still renders the folding indirectly: sulci are
CSF-filled and dark, gyral crowns are gray matter and brighter, so a lateral sweep
across the cortical ribbon produces a repeating dip.

**Public datasets only.** Deliberate, to avoid an IRB dependency on a fifteen-week
timeline. Patient scans and scanner access are both available through the imaging
center, but a protocol amendment that slips to November would leave the team with
nothing to submit. Patient use is the motivating application; the study population
is volunteers on public data.

**Individual scans, not MNI152.** MNI152 is an average of 152 brains. Folding that
does not align across subjects is smoothed away, which makes the template close to
the worst possible volume for testing whether someone can perceive cortical relief.
Noticed while exploring the spike and seeing a flat region on the render.

**3D print as the baseline condition.** brain2print already converts a NIfTI to a
printable STL, so the reference condition costs a spool of filament and no
development time. Having a gold standard to measure the digital conditions against
materially strengthens the study.

### Ruled out, with reasons

**Apple Pencil Pro haptics.** There is no public API for custom haptics on Apple
Pencil Pro. Core Haptics code that works on iPhone does not work on iPad with a
paired Pencil, and an Apple DTS engineer confirmed that even invoking predefined
sequences programmatically is unsupported. `UICanvasFeedbackGenerator` does drive
Pencil haptics, but exposes exactly two methods, `alignmentOccurred` and
`pathCompleted`, both taking only a location. No intensity, no duration, no
waveform. Gradient magnitude therefore cannot map to signal strength, only to pulse
rate. It also fires only for Pencil-initiated touches.

**Custom refreshable pin array.** Braille pitch is 2.5mm, which forces piezo
bimorph actuators at roughly a dollar a pin and is the entire reason commercial
tactile displays cost thousands. Coarser pitch of 8 to 10mm would let conventional
actuators fit underneath, and an 8x8 grid at that spacing is perhaps $200 to $400
in parts. But the mechanical work — pin guides, alignment, friction — is a semester
on its own, in a course that grades design process and evaluation rather than
hardware. Kept as a personal project, decoupled from anything the team's grade
depends on.

**Having a model describe the scan aloud.** Technically easy and superficially
impressive. Rejected on design grounds: it replaces the user's exploration with a
caption, so the model does the perceiving and the person receives a summary. For an
accessibility project that is the wrong direction. Worth stating explicitly in the
proposal rather than leaving unaddressed.

### The AI component

The course requires an AI-driven user interface. Sonifying voxel intensity has no
AI in it, so this needed solving rather than decorating.

The honest answer is in-browser segmentation. For MNI152 an atlas in the same space
gives structure names with a lookup and no model at all. But that only works for
the template — an individual scan is not in MNI space, and the atlas is useless. A
segmentation model is what makes labels work on a volume the system has not seen
before, which is exactly the patient-facing case.

brainchop does deep-learning volumetric segmentation entirely in the browser and is
what brain2print already uses. The model's output becomes the interface content the
user perceives. That is AI-driven in the strong sense rather than a wrapper around
a chat box.

Natural-language navigation — "take me to the left hippocampus" — is the stretch
goal. It depends on segmentation existing first and adds an API key and network
dependency, so it is second, not first.

### Hardware path

Bone conduction, using Shokz headphones already owned. The argument is not that it
feels tactile — bone conduction still goes to the cochlea — but that the ear canal
stays open, so a blind user keeps their ears for a screen reader, a facilitator,
and the room. Occluding headphones take that away.

For genuine touch, a bone conduction transducer such as the Dayton Audio BCT-3,
around $25 plus a small class-D amplifier. Pressed against skin it is a wideband
vibrotactile actuator driven by an arbitrary waveform, which gives back the
amplitude control the Pencil refused. Same synthesised signal, rendered
simultaneously as sound and as vibration. Needs firm contact against bone; loose
against skin it barely registers.

### Implementation notes

NiiVue's `build/index.min.js` is not the library. It exports a single string named
`esm` containing the whole library percent-encoded, intended for embedding. The
real entry is `build/niivue/index.js`, which does export `Niivue` but pulls in
seven bare npm imports. Bundled with esbuild as an IIFE and vendored, which also
sidesteps the fact that ES modules cannot be imported from a `file://` origin.

Hover sampling on 2D slices uses `canvasPos2frac`, then `frac2vox`, then
`getValue`. The crosshair is deliberately not moved.

The render tile returns -1 from `canvasPos2frac`. Handled by setting
`uiData.mouseDepthPicker` and calling `drawScene()`, which makes NiiVue read the
depth buffer during that draw and update `scene.crosshairPos`, which is then
sampled. Throttled to one pick per animation frame since each forces a full
redraw. This does move the crosshair, which is acceptable and arguably desirable
feedback in the render view.

### Open questions

- Does the sonification actually convey folding, or does it just sound like noise?
  Needs testing on an individual scan rather than the template.
- If depth is jumping around at sulcal edges, smoothing the picked position is
  likely a better fix than smoothing the audio.
- How does a user navigate to a named structure without sight? Unsolved, and the
  real research question.

### Course context

Team project requirements confirmed with Dr. Zhang on 31 August: propose an
AI-driven user interface solution to a real-world problem the team identifies.
Deliverables build in stages — proposal, task analysis, prototype design, usability
testing. Minimum is a UI prototype; a working system is welcomed. Teams of six,
formed by 16 September.

Task analysis maps to "how does someone currently try to understand a scan without
seeing it." Usability testing maps to the study already planned.

### Next

- Load an individual T1 and listen for whether the folding is audible.
- Send the recruiting email to the accessibility-focused classmate.
- Add brainchop segmentation and announce the structure under the pointer.
- Order the BCT-3 and an amplifier once the audio mapping is validated.

---

## Entry 2 — 2 September 2026

### How the interaction got from touch to sound

This entry is the history of the idea rather than of the code. It is worth writing
down because the current design looks obvious in hindsight and was not. What each
condition actually maps now lives in [EXPERIMENTS.md](EXPERIMENTS.md); this is why
there are conditions at all.

**The original idea was haptic, not auditory.** Before the class even started, the
plan was to let a user drag an Apple Pencil across a volumetric surface and feel the
hills and valleys — gyri and sulci — under the tip. That framing survived a long
time, and everything that followed is a retreat from it.

**Apple Pencil Pro closed that door.** The haptics exist but are not addressable.
`UICanvasFeedbackGenerator` is the only route, it exposes two event types and no
control over intensity, duration or waveform, and it fires only on Pencil-initiated
touches. A continuous surface-relief signal needs amplitude. The API offers pulses.
That is not a gap to be worked around; it is the wrong shape entirely.

**Dot Pad was the obvious substitute and was ruled out on cost.** A refreshable
tactile display would have given a real 2D field of raised cells. The pricing puts
it outside what a semester project can carry, and going through the university to
borrow one introduces a dependency on someone else's calendar. Building one from
scratch was priced out separately (Entry 1) and is a semester of mechanical work in
a course that grades design process.

**The pivot to sound.** Sound is the channel that everyone already owns hardware
for, has an amplitude axis, and can be updated continuously at pointer speed. The
first version simply mapped intensity to pitch: move the pointer, hear the tissue
rise and fall. That alone was enough to prove the loop worked, and it became
condition 01.

**Stereo came next, for orientation.** Pitch says what is under the pointer and
nothing about where the pointer is. Two voxels of equal intensity on opposite sides
of the head are indistinguishable, which makes "go to the structure I named"
impossible before it is even attempted. Panning attaches the tone to a position.
The axis is anatomical rather than screen-relative, which is the decision worth
recording: panning by pointer position would swing the hemispheres across the
stereo image on every rotation, and would only report back what the listener's own
hand already told them. Condition 02.

**Then tapping, for density.** Pitch was already carrying one variable. Rather than
overload it, density became a rhythmic channel — a tap rate, not a frequency — so
three dimensions travel at once and stay separable by ear. Condition 03 drove the
rate from opacity, and the interesting part is that it was specified as "faster
tapping on more opaque surfaces, like bone" and got bone exactly backwards: on a T1
cortical bone is a signal void, the darkest and most transparent thing in the head,
so it tapped slowest. The channel was reporting what the renderer shows, which is
honest, and not what the phrase led you to expect.

**So condition 04 changed what drives the rate rather than the channel.** If
intensity cannot find bone, shape can — a thin dark sheet lying parallel to the
scalp, which is a Hessian question, gated by alignment with the outward direction
so that sulcal CSF, also a thin dark sheet, does not qualify. Keeping the tap layer
and substituting only its driver is what makes 03 and 04 comparable: a listener
switching between them hears exactly one thing change.

**Fine tuning by giving the probe a reach.** Read at a single point the boneness
map is unusable — the vault is a 4 to 7mm shell, 49 of 46,224 raster points land on
it, and on the 3D render the depth pick resolves to the scalp with the skull
underneath, so the one view the channel exists for could not sound bone at all. The
`Spike` control widens the map so each voxel reports the *strongest* bone within a
given distance, the way pressing on your own head finds the skull under it. 8mm is
the default because the vault sits 5.3 to 7.9mm under the outer scalp on this
volume. The cost is real and is why it is a control rather than a constant: cortex
within 8mm of the inner table reports bone too, so the boundary softens as the
probe lengthens, and 0 is kept because that is the honest measurement to check
against.

### Decisions worth naming from this stretch

**One build, not a branch per condition.** Freezing each condition sounds safer for
a study and is not, while the sampler is still wrong in ways we have not found: a
fix that only lands on the newest branch means two conditions stop differing solely
in the thing under test. The trade flips the moment real participant data exists,
and the honest move then is to tag the commit each session ran against.

**Calibrate against volumes, not against itself.** Normalising the boneness map by
its own maximum would make a skull-stripped volume rattle exactly as hard as a
whole head, because something is always the maximum. A fixed window means MNI152
stays quiet, which is the correct report.

**Loudness is not allowed to be a second copy of intensity.** Ear sensitivity rises
about 19 dB between the bottom and top of the pitch range, so a constant-amplitude
sine gets louder as it climbs and the listener cannot tell which channel they are
hearing. Weighting attenuates towards the sensitive band rather than boosting, so
it costs no headroom.

### What the retreat bought

Losing haptics turned out to be productive. The audio version carries three
simultaneous dimensions on hardware every participant already owns, needs no loaned
equipment, has no procurement lead time, and can be evaluated remotely. The tactile
version would have carried one dimension, on a device that costs more than the rest
of the project combined.

Bone conduction remains the bridge back to touch: a BCT-3 pressed against bone is
driven by the same synthesised waveform, so the signal can be heard and felt at
once without redesigning the mapping. Stereo complicates it — the field needs both
ears, and a single transducer cannot give one.

### Open questions

- No condition has been run with listeners. Everything above is design reasoning
  and instrumented measurement, not evidence.
- Boneness is a derived, unitless quantity, unlike intensity and position which a
  listener can reason about directly. The honest framing may be "this surface is
  shaped like the outside of your head" rather than "bone", and a listener has no
  way to check it.
- Navigating to a named structure is still unsolved, and is still the actual
  research question.

---

## Entry 3 — 2 September 2026

### Front-back, and why it is not Doppler

The ask was to position the taps in 3D — stereo for left-right, Doppler for
front-back. Two things had to be said before building it.

The taps were already panned. The panner sits downstream of both layers, so a
tap and the tone it belongs to have always arrived from the same place; that has
been true since 03, taps-only mode included. Left-right on the taps was not a
missing feature, it was a feature nobody had said out loud. Worth remembering
that a request can be for something that already exists, and that saying so is
cheaper than building it twice.

**Doppler was ruled out, and the reason generalises.** Doppler is a velocity
cue: the shift is proportional to how fast the source approaches, so a
stationary source produces none wherever it sits. Mapping the anterior-posterior
*coordinate* to a pitch shift would not be Doppler at all, just pitch mapping
wearing its name; mapping the *velocity* would be real Doppler but would report
which way the pointer is moving rather than where it is, and would fall silent
whenever it stopped. This whole app is a probe you hold still on a voxel to
interrogate it, so a cue that only exists while moving is the wrong shape for
it. There is a second problem: the classic Doppler percept on a click train is
partly the rate rising as the source approaches, and the rate is already the
density channel. Doppler could only have moved pitch, which is the weaker half
of the effect.

**HRTF panning was also ruled out**, more reluctantly. A `PannerNode` in HRTF
mode would take an actual x/y/z in millimeters and give all three axes at once,
elevation included, which is literally what was asked for. But generic HRTFs are
weakest at exactly the axis that motivated the request — front-back confusion is
their well-known failure — so it would have spent the most machinery on the
least reliable result, required headphones, and retired the tested `pan()`
mapping for something unauditable. Keeping the cue explicit means it can be
measured. If the brightness cue fails with listeners this is the obvious thing
to try next, and it is not foreclosed.

**What was built instead: brightness.** The band a tap is struck through moves
an octave either side of 1800 Hz with anterior-posterior position. The reasoning
is that front-back is unpannable in principle — a source ahead and one behind
give the ears identical time and level differences — and what resolves it in
life is the pinna filtering sound from behind. That is a spectral cue, so a
spectral cue is what to build. A tap is a broadband burst and carries one well.

An octave each way rather than more: widening it would buy contrast by sinking
the posterior end into the pitch channel's range, which the tap layer was put
above on purpose.

### Implementation notes

The tap level had to stop being a constant. It was `loudnessGain(1800)`
evaluated once, which was right when the band never moved. With the band
sweeping 992 to 2944 Hz it would have made anterior taps markedly louder as well
as brighter, since the ear is much more sensitive at 3 kHz than at 1. A depth
cue that also moves loudness is two cues that can disagree, and the listener has
no way to know which one to believe. Weighting each strike at the band it is
actually struck through leaves brightness as the only thing moving. The
equal-loudness work from the earlier session paid for itself here without having
been written with this in mind.

`anteriority` is a separate function from `pan` rather than `pan` called on
world Y, even though the arithmetic is identical and they now share a private
helper. They are separate channels with separate controls: collapsing the stereo
field to mono must not also flatten depth.

Verifying it in the browser cost more than writing it. Synthetic `pointermove`
events were landing in a different tile than the coordinates I computed for
them, which produced a run of readings where the anterior-posterior coordinate
never moved and the cue looked broken. It was not — `offsetX`/`offsetY` are what
the sampler reads, and they are not reliably derived from `clientX`/`clientY` on
a constructed event. Defining them on the event explicitly fixed it. Two earlier
sweeps also timed out because every pointer move over the render tile costs a
depth pick, which is a full redraw; the same mistake as the spike measurement,
made again a day later.

### Open questions

- Does the brightness survive being heard at the same time as the rate? Both now
  ride the same strike, which is either economical or a collision.
- Superior-inferior is still unmapped, and there is nothing obvious left to map
  it to. Pitch is intensity, rate is density, color is now front-back. A
  listener who cannot see the crosshair has no way to get the third axis.
- Is bright/anterior learnable as an absolute, or only as a relative? Nothing
  anchors it except practice.

---

## Entry 4 — 3 September 2026

### Height uses the remaining level channel

The gap was found working with Roger Newman-Norland: stereo carried
left-right and tap brightness carried front-back, and superior-inferior was
the one anatomical axis nothing encoded.

Superior-inferior was added as a sixth experiment condition. World Z maps to a
bounded loudness window: inferior positions are attenuated and superior
positions are at the selected master level. The earlier channels remain
unchanged: pitch carries intensity, stereo carries left-right, and tap
brightness carries front-back.

Loudness was chosen because it is a stationary cue, unlike Doppler, and because
the other available continuous dimensions already have established meanings.
The window is deliberately bounded and never boosts above the master setting,
so height does not create a second unbounded volume control.

The mapping is not validated with listeners. The open question is whether the
level change remains perceptually distinct from intensity and gate behavior
while the other cues are active.

### Next

- Run 04 against 05 with the same volume and decide whether depth helps or
  merely adds to the load.
- The readout leaves a stale `mm` on the row when the pointer goes off-tile —
  every other field clears. Not mine, not urgent, but it made these measurements
  harder to read than they needed to be.

---

## Entry 5 — 3 September 2026

### A directional control for someone who cannot rely on the pointer

The pointer-hover interaction is the whole interface, and that is a problem for
anyone who cannot aim a mouse or trackpad precisely, cerebral palsy included.
Built a second way to move the crosshair: a fieldset of seven buttons (Up,
Down, Left, Right, Back, Front, Center), each a real `<button>` at a 44px
minimum so it works by click, tap, switch-scan, or keyboard tab order. A step
size selector trades reach for precision. Arrow keys nudge left/right/up/down
from focus anywhere in the group, and a `role="status"` live region announces
every move for anyone driving it by ear rather than by screen.

### A bug the eye could not have caught

The crosshair's actual position was always correct — checked against the mm
readout throughout. The spoken announcement was not: the label array behind
the live-region text had the up/down and back/forward axes swapped, so
clicking Up said "moved forward," clicking Back said "moved up," and so on for
four of the six directions. The motion and the description of the motion
disagreed with each other. This is the kind of bug that is invisible if you are
watching the screen, since the crosshair itself lands in the right place, and
is only visible to whichever channel this control was built for. Found by
testing the live announcement against each button directly rather than trusting
the visual result, fixed, and re-verified against all six directions plus both
keyboard paths.

### Page Up / Page Down for the third axis

Arrow keys only ever covered two of the three axes — there was no keyboard
route to front/back, only click or tap on those two buttons specifically. Asked
rather than guessed at the fix, since the right binding depends on what an
actual adaptive input device maps to, which is not something to invent. Page
Up moves forward and Page Down moves back, on the same axis-map pattern as the
arrow keys, and the fieldset now carries a visible one-line hint naming both
key sets.

### Open questions

- None of this has been tried by anyone who cannot use a mouse. The button
  size and step sizes are reasoned about, not measured against actual use.
- Whether Page Up / Page Down is the right pair for whatever device gets used
  is still open — it was the reasonable default, not a tested choice.

---

## Entry 6 — 3 September 2026

### An unpitched voice, so the tapping reads as background

The idea of a noise voice, white or pink in place of the tone, was David
Reddy's.

Next experiment: replace the pitched continuous voice with noise, so the bone
rhythm has less pitch to compete with and can be heard sitting in the
background rather than riding on top of a moving tone. Added a fourth
condition, `07-texture`, and a third `Mapping` mode (`texture`) alongside the
existing `tone` and `noise`.

### Decisions made

**Brightness carries intensity, not loudness.** Loudness is already spent —
06 uses it for inferior-superior position. Doubling it up here would put two
facts on one dimension, the same collision the depth channel was built to
avoid on the pan axis. Asked rather than assumed; brightness (a lowpass
cutoff) was the open dimension.

**A new white-noise buffer, not the existing pink noise.** The taps and the
old `Filtered noise` mode already use pink noise. Asked whether `texture`
should reuse that buffer or use something distinct, on the reasoning that
sharing a color between the voice and the taps works against the goal —
telling them apart wants two cues, not one. Went with true white noise: flat,
unshaped, through a lowpass with no resonant center, so nothing about it reads
as a pitch the way even the bandpassed `noise` mode still faintly does.

### Implementation notes

Building the third source surfaced an undocumented issue in the existing
graph: the oscillator and the band-passed noise for `tone`/`noise` modes were
both wired straight into the shared `voice` gain, with nothing muting the
inactive one. Only the *frequency being animated* differed between modes; the
other source was still sounding underneath it, quietly. Fixed by giving each
of the three sources — oscillator, banded pink noise, low-passed white noise —
its own gain node ahead of `voice`, switched by `AudioSettings.mode`. All
three keep running for the life of the context regardless, since starting and
stopping a node per mode switch is audible as a click; only the gain moves.

This was not something the texture work strictly required — `texture`'s own
gain could have been added without touching the older two-source path — but
leaving the old summing behavior in place would have meant `texture` was the
only mode actually isolated, which defeats its point.

### Open questions

- Loudness is not compensated for the lowpass's own bandwidth: a wider
  passband admits more of a flat spectrum, so the raw signal gets louder as
  the cutoff opens, on top of whatever `loudnessGain` already does for ear
  sensitivity. Flagged in the code, not measured, not fixed — the existing
  `NOISE_MAKEUP`-style constant felt like it would be inventing a number
  rather than measuring one.
- The cutoff span reuses `frequency()` unchanged — the same Hz-and-octaves
  range built for pitch. Whether that is the right span for a filter cutoff
  has not been checked by ear.
- Whether an unpitched bed actually reads as "background" the way the
  hypothesis expects, or whether continuous broadband noise is just as
  attention-grabbing as a tone was, only louder in a different way. Nothing
  here has been run with a listener yet.

### Next

- Listen to 04 (bone rhythm) under `Texture` against `Pure tone`, specifically
  at the vault boundary, and decide whether the rhythm actually comes forward.
- If the bandwidth-loudness gap turns out to matter by ear, measure it rather
  than guess at a makeup constant.

---

## Entry 7 — 3 September 2026

### Drawing the spike probe, not just hearing it

`Spike` (condition 04+) widens the boneness map so a hover reports the
densest bone within reach, but the map only ever carried the value — nothing
recorded which voxel it actually came from. Asked, and confirmed: the line
should run from wherever the sample currently driving the tap sound is (the
live hover point, or the crosshair when moved by click or the D-pad — not a
separate, always-fixed anchor), to whichever voxel `reach()` is reporting.

### Carrying the origin through the widening filter

`reach()` is three sequential sliding-window maximums, one per axis. Getting
a location out of it meant threading an index array alongside the value
array through all three passes: each pass now reads its index from the
source rather than recomputing a local one, so what survives three passes is
the true flat index in the untouched grid, not an offset relative to
whichever pass last touched it. `densestVoxel()` decodes that back into
full-resolution voxel coordinates on the same rounding convention
`bonenessAt()` already uses going the other way. Verified against the exact
fixture already in `boneness.spec.ts` ("reports the strongest bone in range,
not the nearest") before trusting it — the sandbox this session runs test
files in can't execute vitest (a known platform mismatch: the mounted
`node_modules` has darwin-arm64 native binaries, the sandbox is linux-arm64),
so the algorithm was cross-checked with a standalone plain-JS reproduction of
`reach()`/`densestVoxel()` run under plain `node`, matching the fixture and a
handful of new edge cases by hand before the real TypeScript was trusted.

### A NiiVue API that quietly refuses the point this needed

First pass drew the line with NiiVue's own `frac2canvasPosWithTile`. It
compiled, ran without error, and drew nothing. Traced by instrumenting
`nv.drawLine` directly in the live app (a `window.nv` handle this app already
exposes in dev) rather than guessing from the outside: the two endpoints
*were* being computed correctly, but `frac2canvasPosWithTile` returned `null`
for both, on every tile, whenever the target voxel was more than about 2mm
off the slice a tile is currently showing — which is nearly always, since the
entire reason to draw this line is that the probe found bone somewhere the
sampled slice does not show. Reading NiiVue's own source confirmed it: that
tolerance is correct for its click-to-measure ruler, where both ends are
meant to sit on one slice, and wrong for a probe that reaches past it by
design.

Fixed by writing `projectToTile()`: the same affine map NiiVue's function
uses internally (`leftTopMM`/`fovMM`/`leftTopWidthHeight` off
`nv.screenSlices`), minus the distance-to-slice check — an orthographic
projection onto each tile's own plane, honest about being a shadow rather
than a literal point. Confirmed against a standalone reproduction fed real
`screenSlices` values captured from the live app, then confirmed in the
browser by instrumenting `drawLine` again: three line-draws (one per 2D
tile) at a real, non-maximal boneness hover point, zero at a background
point off the head entirely.

### What is not covered

The line only draws on the 2D tiles. Drawing it on the 3D render as well
would need that camera's own model-view-projection matrix, which NiiVue
builds fresh inside its own draw call and does not hand back out —
reconstructing it looked like more reverse-engineering than a first pass was
worth. The 2D tiles stay visible during a render hover too, so the line
isn't lost, only not drawn on top of the render itself.

The line also does not survive a redraw NiiVue triggers on its own —
dragging to rotate or zoom a tile. It is drawn as a follow-up call after this
app's own `nv.drawScene()` calls, not from inside NiiVue's draw cycle, so it
only reappears on the next sampled voxel. Accepted rather than fixed: the
alternative was replacing the instance's own `drawScene` method so every
redraw source runs the overlay too, which is a real technique (confirmed
every internal NiiVue call site goes through `this.drawScene()`) but a much
more invasive one for a hover aid whose primary use is, in fact, hovering.

### Open questions

- Whether the projected line actually reads as "the probe reached out this
  way" once seen, or just as visual noise competing with the sulcal detail
  underneath it — unvalidated, like every other channel here.
- Whether the 3D-render gap matters in practice, given depth-picking already
  lands on the scalp with the bone underneath it — the exact case `Spike`
  exists for.

---

## Entry 8 — 4 September 2026

### A sound key

David Reddy's second idea: a sound key, a short demonstration of what each
sound means, so a listener is told the mapping rather than left to infer it
from hovering. Every condition so far assumes the listener already knows that
pitch is intensity, that the taps are bone, that the level drop is height. A
sighted user reads that off the readout rows. A user working by ear has
nothing equivalent.

The natural moment for it is the `Enable sound` click. That is the one point
where the audio context is guaranteed to have just come alive and the listener
is guaranteed to be waiting for something, and it happens before the first
hover, which is when the key is needed.

Not built. Open before it is:

- What the key actually plays: each channel in isolation, sweeping its range,
  or one composite sound walked through its parts.
- Whether it needs spoken labels to be a key at all, which would make it the
  first spoken audio in the app, or whether the sounds alone can be self-
  explaining if ordered well.
- Whether it plays every time sound is enabled or only the first time, and
  whether it can be skipped.
- Which conditions it covers: the key for `01` is one sound, and the key for
  `07` is four.

### Next

- Sketch the key for the current default condition and listen to it before
  deciding any of the above.

---

## Entry 9 — 4 September 2026

### The sound key, built

Entry 8 left four questions open. Building it answered them, in the sense
that each got a first answer and none has been listened to by anyone but me.

### Decisions made

**Each channel in isolation, in the order the study added them.** Pitch,
then left-right, then the taps, then front-back, then height. A composite
sound walked through its parts would have been shorter, but a listener
learning the mapping needs to hear one thing move while everything else
holds still, and the isolated form falls straight out of the experiment
sequence: the key for 01 is one step, and each condition adds the step for
the channel it added.

**Spoken labels, from the browser's own speech engine.** A key that does
not say what a sound means is a demo, not a key. `speechSynthesis` is the
first spoken audio in the app, chosen over recorded clips because the
labels depend on the condition and the `Mapping` mode, and because a clip
cannot be edited in a text file. The label is said *before* the sound, not
over it: hearing one sound cleanly is the whole point of a step, and speech
on top of it is exactly the competition the key exists to remove. Where
there is no speech engine the caption stays up long enough to read and the
sounds play anyway.

**Played through the real audio path.** The key is data, an ordered list of
steps each with a `voice(t)`, driven through the same `Sonifier.update()`
the hover calls, at the panel's current settings. So moving `Low` or
`Octaves` or `Taps` changes what the key demonstrates, and the key cannot
describe a mapping other than the one in force. Pre-rendering it would have
been easier and would have let it drift.

**Every time sound is enabled, and skippable by hovering.** Enabling sound
is the one moment the listener is certainly waiting for something and has
not yet hovered. A hover cancels the key rather than fighting it for the
voice: the listener has just said, with the pointer, that they want the
real thing. A `Sound key` button replays it, since a key you can only hear
by toggling sound off and on is half built.

**The tone is muted during the tap steps.** The rhythm and its brightness
are heard on their own, the way `Taps only` presents them, rather than
under a tone at some arbitrary fixed pitch that would itself need explaining.

### Ruled out

- **An `aria-live` caption.** The label is shown in a visible caption, but
  not announced through a live region: a screen-reader user would hear it
  twice, once from their own reader and once from the key's speech.
- **Speaking over the sound** to halve the length. See above. If the key
  turns out too slow, the fix is shorter labels or shorter sweeps, not overlap.

### Open questions

- How long is too long? Condition 07 is five steps, and a replay timed in
  Chrome on this machine ran 33 seconds end to end, with the spoken labels
  taking about four seconds each and the sweeps two to three. That is more
  speech than sound. Nobody has sat through it but me.
- Speech engines vary by browser and OS. The labels have been heard on one
  machine.
- Whether the height step is audible at all as a key: the window is a
  bounded attenuation, and a sweep of it heard once, in isolation, may
  simply sound like a tone.
- Whether the key should also be offered to someone who has not enabled
  sound, since it is currently the thing that explains why they would.

### Next

- Listen to the key for 07 end to end and cut what does not earn its time.
- Try it on someone who has not seen the readout rows.

### The voice

Added later the same day.

The first runs used the browser's default voice, which on this Mac is
Samantha, the oldest voice macOS ships. Chris asked for something more
natural. The better engines say so in their names: Windows and Edge label
their neural voices `Natural`, macOS labels a downloaded high-quality voice
`Premium` or `Enhanced`, and Chrome carries its own `Google` voices,
streamed from the network. `pickVoice` in `apps/brainsonify/src/soundkey.ts`
ranks those in that order, prefers a US English voice within each rank and
settles for any English, and leaves the default alone when none is on offer.
It runs per utterance rather than once at startup, because Chrome fills the
voice list asynchronously and a choice made at startup is usually made from
an empty list.

This Mac has no `Premium` or `Enhanced` voice installed, so the key now
speaks with `Google US English`. Timed in Chrome on this machine the same
way as before, the five labels of 07 took between 3.8 and 5.1 seconds each,
so the change bought naturalness and no time. The Google voice needs the
network, and what the key does when Chrome cannot reach it has not been
tried.

---

## Entry 10 — 4 September 2026

### Naming the anatomy

Chris asked for an atlas, so that a listener entering a named region hears
its name. That is condition 08: everything 07 does, plus a spoken label.

### Decisions made

**AAL, from NiiVue's own demo images, fetched at runtime.** The demo volumes
already come from `niivue.github.io` and are not stored in the repo; the
atlas follows the same rule. NiiVue's copy of AAL comes with a label table
in the same place, so there was nothing to transcribe.

**The atlas is loaded as an image but never added to the scene.** Adding it
as a second volume would have drawn it, and the opacity and bone channels
read from what the renderer shows. Loaded on its own through `NVImage`, it
is invisible and costs nothing at draw time. Regions are looked up by world
position through the atlas's own affine, so the scan's grid never has to
match: the MNI152 demo and the atlas are different grids at different
spacings, read from their headers, and the lookup does not care.

**Spoken on entry, after a dwell.** The first thought was to speak the name
the moment the label changed. A sweep across the cortex crosses a boundary
every few voxels, and that would have been a stammer of cut-off names. So
the callout waits for the pointer to rest in the region before saying
anything, and a sweep straight across is silent. The dwell is a chosen
value in `atlas.ts`, not a measured one. Coming back to a region after
leaving it is announced again, because the question a listener is asking at
a boundary is "which side am I on now", each time.

**Side first.** AAL writes `Precentral_L`; the callout says "Left
precentral". The side is the fact most worth hearing and the one most
easily lost if the next region cuts the name short. The rest of the name is
AAL's own word order with the abbreviations spelled out, which is not how an
anatomist would say it. See the open question.

**Off for the whole-head T1.** The atlas is in MNI space, and the head scan
is one person in scanner space; looking it up would name regions that are
not there. A file dropped in is assumed to be MNI, because a scan already in
that space is the case worth supporting, and the panel says which it thinks
it has.

**No sound key step.** The key explains sounds a listener could not
otherwise decode. A spoken name decodes itself.

### Ruled out

- **NiiVue's own location callback.** It reports the label under the
  crosshair, and the crosshair is deliberately not moved during 2D hover
  sampling, so it never had the information.
- **An `aria-live` region for the name**, for the same reason as the key's
  caption: a screen-reader user would hear it twice.
- **A dimension of sound for the region.** There are over a hundred labels
  and no sonic dimension with that many learnable steps. Speech is the one
  channel that already has the vocabulary.

### Open questions

- Is a spoken name over the texture and taps heard as a label for what the
  ear is following, or does it stop the listening while it is said? Nobody
  has tried it yet.
- Is the dwell right? It separates passing through from stopping, and only
  listening will say where that line is.
- Should the names be a hand-written table rather than AAL's order spelled
  out?
- Should the key mention the atlas after all, if only to say that the
  voice will speak?

### Next

- Hover the MNI152 demo in 08 and check the spoken side against the tile
  labels and against which ear the tone is in.
- Try the head T1 in 08 and confirm the row says the atlas is off.

### Checked

Both of the above, in Chrome on this machine, same day. On the MNI152 demo
the pointer resting on the left side of the coronal tile read `L 47%` in the
pan row and was spoken as `Left postcentral`, in the Google voice, so the
side agrees with the tile. Hovering while the key was still playing cut the
key at its fourth label and the region name followed, which is the intended
order. On the head T1 the region row read `off: not an MNI scan` and nothing
was spoken over it. The sweep-stays-silent case is only covered by the unit
test; a pointer driven from the browser tools cannot move fast enough to
try it.

### The voice, in another browser

Chris heard the old Samantha voice again and asked what had happened.
Nothing in the app: Chrome on this Mac still renders `Google US English`,
checked by the fact that the utterance starts about half a second late,
fetching from the network, and fires no word-boundary events, where
Samantha starts at once and does. He had been listening in the browser
built into VS Code, which has no Google voices, so `pickVoice` finds
nothing better than the default there. The same goes for Safari. A
downloaded `Premium` or `Enhanced` macOS voice would fix both, since the
picker ranks those first; none is installed here yet.
