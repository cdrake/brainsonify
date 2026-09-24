# brainsonify — Development Journal

ITEC 444, Fall 2026 · Christopher Drake · University of South Carolina

this is where I keep the design decisions, the options we ruled out, and the
reasoning behind both. I keep it because the reasoning is worth more than the
code and it evaporates faster.

entries are append-only, newest at the bottom. `CLAUDE.md` says how they get
written.

this file is the *history* of the project: why it is shaped the way it is, and
what it might have been instead. it is not the experiment log, that is
[EXPERIMENTS.md](EXPERIMENTS.md), which records what each condition maps and what
it showed. and it is not documentation, which is the README.

## the project in one paragraph

medical and scientific imaging is almost entirely visual. someone who cannot see
the screen has no practical way to explore a 3D scan. brainsonify turns pointer
position over an MRI into sound, so moving across the anatomy produces a tone
that tracks the tissue underneath. the longer aim is to pair that audio with a
bone-conduction transducer so the signal is felt as well as heard, and to add
spoken structure labels so a user can tell where they are, not just what they are
touching.

---

## Entry 1 — 31 August 2026

### scoping, feasibility, and a first working spike

**what we built.** a single-page prototype on top of NiiVue 0.69. hover the
pointer over any 2D slice and it reads the voxel intensity underneath and maps it
to pitch through Web Audio. hovering the 3D render does the same by depth-picking
the surface. no clicking, no build step, runs from a static host or the
filesystem. we committed it as a repository with the NiiVue bundle vendored so it
has no runtime dependencies.

### the central design question

sonification alone gives you texture but not location. you can hear that you
crossed something without knowing what it was. getting a pointer to a named
structure without being able to see the render is the harder and more interesting
problem, and that is where the actual contribution is. screen readers solved this
for 2D documents with headings, landmarks and skip links. nothing equivalent
exists for a 3D volume.

### decisions made

**web, not iPadOS.** the rendering already exists in NiiVue, which runs in a
browser. that removes the hardware constraint on who can take part in an
evaluation and gives us Web Audio for the continuous channel.

**volume directly, not a mesh.** sampling voxel intensity needs no surface
extraction. on a T1 this still renders the folding indirectly: sulci are
CSF-filled and dark, gyral crowns are gray matter and brighter, so a lateral sweep
across the cortical ribbon produces a repeating dip.

**public datasets only.** deliberate, to avoid an IRB dependency on a fifteen-week
timeline. patient scans and scanner access are both available through the imaging
center, but a protocol amendment that slips to November would leave the team with
nothing to submit. patient use is the motivating application; the study
population is volunteers on public data.

**individual scans, not MNI152.** MNI152 is an average of 152 brains. folding that
does not line up across subjects gets smoothed away, which makes the template
about the worst possible volume for testing whether someone can perceive cortical
relief. we noticed this while poking at the spike and seeing a flat region on the
render.

**3D print as the baseline condition.** brain2print already converts a NIfTI to a
printable STL, so the reference condition costs a spool of filament and no
development time. having a gold standard to measure the digital conditions
against makes the study materially stronger.

### ruled out, with reasons

**Apple Pencil Pro haptics.** there is no public API for custom haptics on Apple
Pencil Pro. Core Haptics code that works on iPhone does not work on iPad with a
paired Pencil, and an Apple DTS engineer confirmed that even invoking predefined
sequences programmatically is unsupported. `UICanvasFeedbackGenerator` does drive
Pencil haptics, but it exposes exactly two methods, `alignmentOccurred` and
`pathCompleted`, both taking only a location. no intensity, no duration, no
waveform. so gradient magnitude cannot map to signal strength, only to pulse
rate. it also only fires for Pencil-initiated touches.

**custom refreshable pin array.** braille pitch is 2.5mm, which forces piezo
bimorph actuators at roughly a dollar a pin and is the whole reason commercial
tactile displays cost thousands. a coarser pitch of 8 to 10mm would let
conventional actuators fit underneath, and an 8x8 grid at that spacing is maybe
$200 to $400 in parts. but the mechanical work, pin guides, alignment, friction,
is a semester on its own, in a course that grades design process and evaluation
rather than hardware. I am keeping it as a personal project, decoupled from
anything the team's grade depends on.

**having a model describe the scan aloud.** technically easy and superficially
impressive. we rejected it on design grounds: it replaces the user's exploration
with a caption, so the model does the perceiving and the person gets a summary.
for an accessibility project that is the wrong direction. worth saying explicitly
in the proposal rather than leaving it unaddressed.

### the AI component

the course requires an AI-driven user interface. sonifying voxel intensity has no
AI in it, so this needed solving rather than decorating.

the honest answer is in-browser segmentation. for MNI152 an atlas in the same
space gives structure names with a lookup and no model at all. but that only
works for the template. an individual scan is not in MNI space, and the atlas is
useless there. a segmentation model is what makes labels work on a volume the
system has not seen before, which is exactly the patient-facing case.

brainchop does deep-learning volumetric segmentation entirely in the browser and
is what brain2print already uses. the model's output becomes the interface
content the user perceives. that is AI-driven in the strong sense rather than a
wrapper around a chat box.

natural-language navigation, "take me to the left hippocampus", is the stretch
goal. it depends on segmentation existing first and adds an API key and a network
dependency, so it is second, not first.

### hardware path

bone conduction, using the Shokz headphones I already own. the argument is not
that it feels tactile, bone conduction still goes to the cochlea, but that the
ear canal stays open, so a blind user keeps their ears for a screen reader, a
facilitator, and the room. occluding headphones take that away.

for genuine touch, a bone conduction transducer such as the Dayton Audio BCT-3,
around $25 plus a small class-D amplifier. pressed against skin it is a wideband
vibrotactile actuator driven by an arbitrary waveform, which gives back the
amplitude control the Pencil refused. same synthesised signal, rendered at the
same time as sound and as vibration. it needs firm contact against bone; loose
against skin it barely registers.

### implementation notes

NiiVue's `build/index.min.js` is not the library. it exports a single string
named `esm` containing the whole library percent-encoded, meant for embedding.
the real entry is `build/niivue/index.js`, which does export `Niivue` but pulls in
seven bare npm imports. we bundled it with esbuild as an IIFE and vendored it,
which also sidesteps the fact that ES modules cannot be imported from a `file://`
origin.

hover sampling on 2D slices uses `canvasPos2frac`, then `frac2vox`, then
`getValue`. the crosshair is deliberately not moved.

the render tile returns -1 from `canvasPos2frac`. we handled that by setting
`uiData.mouseDepthPicker` and calling `drawScene()`, which makes NiiVue read the
depth buffer during that draw and update `scene.crosshairPos`, which we then
sample. throttled to one pick per animation frame since each one forces a full
redraw. this does move the crosshair, which is fine and arguably good feedback in
the render view.

### open questions

- does the sonification actually convey folding, or does it just sound like
  noise? needs testing on an individual scan rather than the template.
- if depth is jumping around at sulcal edges, smoothing the picked position is
  probably a better fix than smoothing the audio.
- how does a user navigate to a named structure without sight? unsolved, and the
  real research question.

### course context

I confirmed the team project requirements with Dr. Zhang on 31 August: propose
an AI-driven user interface solution to a real-world problem the team identifies.
deliverables build in stages: proposal, task analysis, prototype design,
usability testing. minimum is a UI prototype; a working system is welcomed. teams
of six, formed by 16 September.

task analysis maps to "how does someone currently try to understand a scan
without seeing it." usability testing maps to the study we already have planned.

### next

- load an individual T1 and listen for whether the folding is audible.
- send the recruiting email to the accessibility-focused classmate.
- add brainchop segmentation and announce the structure under the pointer.
- order the BCT-3 and an amplifier once the audio mapping is validated.

---

## Entry 2 — 2 September 2026

### how the interaction got from touch to sound

this entry is the history of the idea rather than of the code. worth writing
down because the current design looks obvious in hindsight and it was not. what
each condition actually maps now lives in [EXPERIMENTS.md](EXPERIMENTS.md); this
is why there are conditions at all.

**the original idea was haptic, not auditory.** before the class even started,
the plan was to let a user drag an Apple Pencil across a volumetric surface and
feel the hills and valleys, gyri and sulci, under the tip. that framing survived
a long time, and everything that followed is a retreat from it.

**Apple Pencil Pro closed that door.** the haptics exist but you cannot address
them. `UICanvasFeedbackGenerator` is the only route, it exposes two event types
and no control over intensity, duration or waveform, and it only fires on
Pencil-initiated touches. a continuous surface-relief signal needs amplitude.
the API offers pulses. that is not a gap to work around; it is the wrong shape
entirely.

**Dot Pad was the obvious substitute and we ruled it out on cost.** a refreshable
tactile display would have given a real 2D field of raised cells. the pricing
puts it outside what a semester project can carry, and going through the
university to borrow one introduces a dependency on someone else's calendar.
building one from scratch was priced out separately (Entry 1) and is a semester
of mechanical work in a course that grades design process.

**the pivot to sound.** sound is the channel everyone already owns hardware for,
it has an amplitude axis, and it can be updated continuously at pointer speed.
the first version simply mapped intensity to pitch: move the pointer, hear the
tissue rise and fall. that alone was enough to prove the loop worked, and it
became condition 01.

**stereo came next, for orientation.** pitch says what is under the pointer and
nothing about where the pointer is. two voxels of equal intensity on opposite
sides of the head are indistinguishable, which makes "go to the structure I
named" impossible before it is even attempted. panning attaches the tone to a
position. the axis is anatomical rather than screen-relative, which is the
decision worth recording: panning by pointer position would swing the
hemispheres across the stereo image on every rotation, and would only report
back what the listener's own hand already told them. condition 02.

**then tapping, for density.** pitch was already carrying one variable. rather
than overload it, density became a rhythmic channel, a tap rate, not a
frequency, so three dimensions travel at once and stay separable by ear.
condition 03 drove the rate from opacity, and the interesting part is that it
was specified as "faster tapping on more opaque surfaces, like bone" and got
bone exactly backwards: on a T1 cortical bone is a signal void, the darkest and
most transparent thing in the head, so it tapped slowest. the channel was
reporting what the renderer shows, which is honest, and not what the phrase led
you to expect.

**so condition 04 changed what drives the rate rather than the channel.** if
intensity cannot find bone, shape can: a thin dark sheet lying parallel to the
scalp, which is a Hessian question, gated by alignment with the outward
direction so that sulcal CSF, also a thin dark sheet, does not qualify. keeping
the tap layer and swapping only its driver is what makes 03 and 04 comparable: a
listener switching between them hears exactly one thing change.

**fine tuning by giving the probe a reach.** read at a single point the boneness
map is unusable. the vault is a 4 to 7mm shell, 49 of 46,224 raster points land
on it, and on the 3D render the depth pick resolves to the scalp with the skull
underneath, so the one view the channel exists for could not sound bone at all.
the `Spike` control widens the map so each voxel reports the *strongest* bone
within a given distance, the way pressing on your own head finds the skull under
it. 8mm is the default because the vault sits 5.3 to 7.9mm under the outer scalp
on this volume. the cost is real and is why it is a control rather than a
constant: cortex within 8mm of the inner table reports bone too, so the boundary
softens as the probe lengthens, and we kept 0 because that is the honest
measurement to check against.

### decisions worth naming from this stretch

**one build, not a branch per condition.** freezing each condition sounds safer
for a study and is not, while the sampler is still wrong in ways we have not
found: a fix that only lands on the newest branch means two conditions stop
differing solely in the thing under test. the trade flips the moment real
participant data exists, and the honest move then is to tag the commit each
session ran against.

**calibrate against volumes, not against itself.** normalising the boneness map
by its own maximum would make a skull-stripped volume rattle exactly as hard as a
whole head, because something is always the maximum. a fixed window means MNI152
stays quiet, which is the correct report.

**loudness is not allowed to be a second copy of intensity.** ear sensitivity
rises about 19 dB between the bottom and top of the pitch range, so a
constant-amplitude sine gets louder as it climbs and the listener cannot tell
which channel they are hearing. weighting attenuates towards the sensitive band
rather than boosting, so it costs no headroom.

### what the retreat bought

losing haptics turned out to be productive. the audio version carries three
simultaneous dimensions on hardware every participant already owns, needs no
loaned equipment, has no procurement lead time, and can be evaluated remotely.
the tactile version would have carried one dimension, on a device that costs
more than the rest of the project combined.

bone conduction is still the bridge back to touch: a BCT-3 pressed against bone
is driven by the same synthesised waveform, so the signal can be heard and felt
at once without redesigning the mapping. stereo complicates it. the field needs
both ears, and a single transducer cannot give one.

### open questions

- no condition has been run with listeners. everything above is design reasoning
  and instrumented measurement, not evidence.
- boneness is a derived, unitless quantity, unlike intensity and position which
  a listener can reason about directly. the honest framing may be "this surface
  is shaped like the outside of your head" rather than "bone", and a listener
  has no way to check it.
- navigating to a named structure is still unsolved, and is still the actual
  research question.

---

## Entry 3 — 2 September 2026

### front-back, and why it is not Doppler

I asked to position the taps in 3D: stereo for left-right, Doppler for
front-back. two things had to be said before building it.

the taps were already panned. the panner sits downstream of both layers, so a
tap and the tone it belongs to have always arrived from the same place; that has
been true since 03, taps-only mode included. left-right on the taps was not a
missing feature, it was a feature nobody had said out loud. worth remembering
that a request can be for something that already exists, and that saying so is
cheaper than building it twice.

**Doppler was ruled out, and the reason generalises.** Doppler is a velocity
cue: the shift is proportional to how fast the source approaches, so a
stationary source produces none wherever it sits. mapping the anterior-posterior
*coordinate* to a pitch shift would not be Doppler at all, just pitch mapping
wearing its name; mapping the *velocity* would be real Doppler but would report
which way the pointer is moving rather than where it is, and would go silent
whenever it stopped. this whole app is a probe you hold still on a voxel to
interrogate it, so a cue that only exists while moving is the wrong shape for
it. there is a second problem: the classic Doppler percept on a click train is
partly the rate rising as the source approaches, and the rate is already the
density channel. Doppler could only have moved pitch, which is the weaker half
of the effect.

**HRTF panning was also ruled out**, more reluctantly. a `PannerNode` in HRTF
mode would take an actual x/y/z in millimeters and give all three axes at once,
elevation included, which is literally what I asked for. but generic HRTFs are
weakest at exactly the axis that motivated the request, front-back confusion is
their well-known failure, so it would have spent the most machinery on the
least reliable result, required headphones, and retired the tested `pan()`
mapping for something unauditable. keeping the cue explicit means it can be
measured. if the brightness cue fails with listeners this is the obvious thing
to try next, and it is not foreclosed.

**what we built instead: brightness.** the band a tap is struck through moves
an octave either side of 1800 Hz with anterior-posterior position. the reasoning
is that front-back is unpannable in principle, a source ahead and one behind
give the ears identical time and level differences, and what resolves it in
life is the pinna filtering sound from behind. that is a spectral cue, so a
spectral cue is what to build. a tap is a broadband burst and carries one well.

an octave each way rather than more: widening it would buy contrast by sinking
the posterior end into the pitch channel's range, which we put the tap layer
above on purpose.

### implementation notes

the tap level had to stop being a constant. it was `loudnessGain(1800)`
evaluated once, which was right when the band never moved. with the band
sweeping 992 to 2944 Hz it would have made anterior taps markedly louder as well
as brighter, since the ear is much more sensitive at 3 kHz than at 1. a depth
cue that also moves loudness is two cues that can disagree, and the listener has
no way to know which one to believe. weighting each strike at the band it is
actually struck through leaves brightness as the only thing moving. the
equal-loudness work from the earlier session paid for itself here without having
been written with this in mind.

`anteriority` is a separate function from `pan` rather than `pan` called on
world Y, even though the arithmetic is identical and they now share a private
helper. they are separate channels with separate controls: collapsing the stereo
field to mono must not also flatten depth.

verifying it in the browser cost more than writing it. synthetic `pointermove`
events were landing in a different tile than the coordinates computed for them,
which produced a run of readings where the anterior-posterior coordinate never
moved and the cue looked broken. it was not. `offsetX`/`offsetY` are what the
sampler reads, and they are not reliably derived from `clientX`/`clientY` on a
constructed event. defining them on the event explicitly fixed it. two earlier
sweeps also timed out because every pointer move over the render tile costs a
depth pick, which is a full redraw; the same mistake as the spike measurement,
made again a day later.

### open questions

- does the brightness survive being heard at the same time as the rate? both now
  ride the same strike, which is either economical or a collision.
- superior-inferior is still unmapped, and there is nothing obvious left to map
  it to. pitch is intensity, rate is density, color is now front-back. a
  listener who cannot see the crosshair has no way to get the third axis.
- is bright/anterior learnable as an absolute, or only as a relative? nothing
  anchors it except practice.


---

## Entry 4 — 3 September 2026

### height gets the level channel we had left

working with Roger Newman-Norland we found the gap: stereo carried
left-right and tap brightness carried front-back, and superior-inferior was
the one anatomical axis nothing encoded.

so we added superior-inferior as a sixth condition. world Z maps to a bounded
loudness window: lower positions are attenuated and higher positions sit at
the selected master level. the earlier channels stay as they were. pitch
carries intensity, stereo carries left-right, tap brightness carries
front-back.

we went with loudness because it is a stationary cue, unlike Doppler, and
because the other continuous dimensions we had already mean something. the
window is deliberately bounded and never boosts above the master setting, so
height doesn't turn into a second unbounded volume control.

we haven't validated the mapping with listeners. the open question is whether
the level change stays perceptually distinct from intensity and the gate
while the other cues are going.

### next

- run 04 against 05 at the same volume and decide whether depth helps or just
  adds to the load.
- the readout leaves a stale `mm` on the row when the pointer goes off-tile.
  every other field clears. not mine, not urgent, but it made these
  measurements harder to read than they needed to be.

---

## Entry 5 — 3 September 2026

### a directional control for someone who can't rely on the pointer

hovering the pointer is the whole interface, and that is a problem for anyone
who can't aim a mouse or trackpad precisely, cerebral palsy included. so we
built a second way to move the crosshair: a fieldset of seven buttons (Up,
Down, Left, Right, Back, Front, Center), each a real `<button>` at a 44px
minimum so it works by click, tap, switch-scan, or keyboard tab order. a step
size selector trades reach for precision. arrow keys nudge left/right/up/down
from focus anywhere in the group, and a `role="status"` live region announces
every move for anyone driving it by ear rather than by screen.

### a bug the eye couldn't have caught

the crosshair's actual position was always right. we checked it against the
mm readout the whole way through. the spoken announcement was not: the label
array behind the live-region text had the up/down and back/forward axes
swapped, so clicking Up said "moved forward," clicking Back said "moved up,"
and so on for four of the six directions. the motion and the description of
the motion disagreed with each other. this is the kind of bug that is
invisible if you are watching the screen, since the crosshair itself lands in
the right place, and only shows up on the one channel this control was built
for. we found it by testing the live announcement against each button
directly rather than trusting what we saw, fixed it, and checked all six
directions again plus both keyboard paths.

### Page Up / Page Down for the third axis

arrow keys only ever covered two of the three axes. there was no keyboard
route to front/back, only click or tap on those two buttons specifically. we
asked rather than guessed at the fix, since the right binding depends on what
an actual adaptive input device maps to, which is not something to invent.
Page Up moves forward and Page Down moves back, on the same axis-map pattern
as the arrow keys, and the fieldset now carries a visible one-line hint
naming both key sets.

### open questions

- none of this has been tried by anyone who can't use a mouse. the button
  size and step sizes are reasoned about, not measured against actual use.
- whether Page Up / Page Down is the right pair for whatever device gets used
  is still open. it was the reasonable default, not a tested choice.

---

## Entry 6 — 3 September 2026

### an unpitched voice, so the tapping reads as background

the idea of a noise voice, white or pink in place of the tone, was David
Reddy's.

so the next experiment: replace the pitched continuous voice with noise, so
the bone rhythm has less pitch to compete with and can be heard sitting in
the background rather than riding on top of a moving tone. we added a fourth
condition, `07-texture`, and a third `Mapping` mode (`texture`) alongside the
existing `tone` and `noise`.

### decisions made

**brightness carries intensity, not loudness.** loudness is already spent.
06 uses it for inferior-superior position. doubling it up here would put two
facts on one dimension, the same collision the depth channel was built to
avoid on the pan axis. we asked rather than assumed; brightness (a lowpass
cutoff) was the open dimension.

**a new white-noise buffer, not the existing pink noise.** the taps and the
old `Filtered noise` mode already use pink noise. we asked whether `texture`
should reuse that buffer or use something distinct, on the reasoning that
sharing a color between the voice and the taps works against the goal.
telling them apart wants two cues, not one. we went with true white noise:
flat, unshaped, through a lowpass with no resonant center, so nothing about
it reads as a pitch the way even the bandpassed `noise` mode still faintly
does.

### implementation notes

building the third source turned up an undocumented issue in the existing
graph: the oscillator and the band-passed noise for `tone`/`noise` modes were
both wired straight into the shared `voice` gain, with nothing muting the
inactive one. only the *frequency being animated* differed between modes;
the other source was still sounding underneath it, quietly. we fixed it by
giving each of the three sources, oscillator, banded pink noise, low-passed
white noise, its own gain node ahead of `voice`, switched by
`AudioSettings.mode`. all three keep running for the life of the context
regardless, since starting and stopping a node per mode switch is audible as
a click; only the gain moves.

the texture work didn't strictly need this. `texture`'s own gain could have
been added without touching the older two-source path. but leaving the old
summing behavior in place would have meant `texture` was the only mode
actually isolated, which defeats its point.

### open questions

- loudness is not compensated for the lowpass's own bandwidth: a wider
  passband admits more of a flat spectrum, so the raw signal gets louder as
  the cutoff opens, on top of whatever `loudnessGain` already does for ear
  sensitivity. flagged in the code, not measured, not fixed. the existing
  `NOISE_MAKEUP`-style constant felt like it would be inventing a number
  rather than measuring one.
- the cutoff span reuses `frequency()` unchanged, the same Hz-and-octaves
  range built for pitch. whether that is the right span for a filter cutoff
  hasn't been checked by ear.
- whether an unpitched bed actually reads as "background" the way the
  hypothesis expects, or whether continuous broadband noise is just as
  attention-grabbing as a tone was, only louder in a different way. nothing
  here has been run with a listener yet.

### next

- listen to 04 (bone rhythm) under `Texture` against `Pure tone`, specifically
  at the vault boundary, and decide whether the rhythm actually comes forward.
- if the bandwidth-loudness gap turns out to matter by ear, measure it rather
  than guess at a makeup constant.

---

## Entry 7 — 3 September 2026

### drawing the spike probe, not just hearing it

`Spike` (condition 04+) widens the boneness map so a hover reports the
densest bone within reach, but the map only ever carried the value. nothing
recorded which voxel it actually came from. we asked, and confirmed: the line
should run from wherever the sample currently driving the tap sound is (the
live hover point, or the crosshair when moved by click or the D-pad, not a
separate, always-fixed anchor), to whichever voxel `reach()` is reporting.

### carrying the origin through the widening filter

`reach()` is three sequential sliding-window maximums, one per axis. getting
a location out of it meant threading an index array alongside the value
array through all three passes: each pass now reads its index from the
source rather than recomputing a local one, so what survives three passes is
the true flat index in the untouched grid, not an offset relative to
whichever pass last touched it. `densestVoxel()` decodes that back into
full-resolution voxel coordinates on the same rounding convention
`bonenessAt()` already uses going the other way. we verified it against the
exact fixture already in `boneness.spec.ts` ("reports the strongest bone in
range, not the nearest") before trusting it. the sandbox this session runs
test files in can't execute vitest (a known platform mismatch: the mounted
`node_modules` has darwin-arm64 native binaries, the sandbox is linux-arm64),
so we cross-checked the algorithm with a standalone plain-JS reproduction of
`reach()`/`densestVoxel()` run under plain `node`, matching the fixture and a
handful of new edge cases by hand before trusting the real TypeScript.

### a NiiVue API that quietly refuses the point this needed

the first pass drew the line with NiiVue's own `frac2canvasPosWithTile`. it
compiled, ran without error, and drew nothing. we traced it by instrumenting
`nv.drawLine` directly in the live app (a `window.nv` handle this app already
exposes in dev) rather than guessing from the outside: the two endpoints
*were* being computed correctly, but `frac2canvasPosWithTile` returned `null`
for both, on every tile, whenever the target voxel was more than about 2mm
off the slice a tile is currently showing. which is nearly always, since the
entire reason to draw this line is that the probe found bone somewhere the
sampled slice does not show. reading NiiVue's own source confirmed it: that
tolerance is right for its click-to-measure ruler, where both ends are meant
to sit on one slice, and wrong for a probe that reaches past it by design.

we fixed it by writing `projectToTile()`: the same affine map NiiVue's
function uses internally (`leftTopMM`/`fovMM`/`leftTopWidthHeight` off
`nv.screenSlices`), minus the distance-to-slice check. an orthographic
projection onto each tile's own plane, honest about being a shadow rather
than a literal point. we confirmed it against a standalone reproduction fed
real `screenSlices` values captured from the live app, then confirmed it in
the browser by instrumenting `drawLine` again: three line-draws (one per 2D
tile) at a real, non-maximal boneness hover point, zero at a background point
off the head entirely.

### what is not covered

the line only draws on the 2D tiles. drawing it on the 3D render as well
would need that camera's own model-view-projection matrix, which NiiVue
builds fresh inside its own draw call and doesn't hand back out.
reconstructing it looked like more reverse-engineering than a first pass was
worth. the 2D tiles stay visible during a render hover too, so the line isn't
lost, only not drawn on top of the render itself.

the line also doesn't survive a redraw NiiVue triggers on its own, dragging
to rotate or zoom a tile. it is drawn as a follow-up call after this app's
own `nv.drawScene()` calls, not from inside NiiVue's draw cycle, so it only
reappears on the next sampled voxel. we accepted that rather than fixing it:
the alternative was replacing the instance's own `drawScene` method so every
redraw source runs the overlay too, which is a real technique (every internal
NiiVue call site goes through `this.drawScene()`, we checked) but a much more
invasive one for a hover aid whose main use is, in fact, hovering.

### open questions

- whether the projected line actually reads as "the probe reached out this
  way" once seen, or just as visual noise competing with the sulcal detail
  underneath it. unvalidated, like every other channel here.
- whether the 3D-render gap matters in practice, given depth-picking already
  lands on the scalp with the bone underneath it, the exact case `Spike`
  exists for.


---

## Entry 8 — 4 September 2026

### a sound key

another great idea from David Reddy: a sound key that explains what the
different sounds mean, a short demonstration so a listener is told the
mapping rather than left to work it out from hovering. every condition so
far assumes the listener already knows that pitch is intensity, that the
taps are bone, that the level drop is height. a sighted user reads that off
the readout rows. a user working by ear has nothing like it.

I thought this could play when the user clicks `Enable sound`. that is the
one point where the audio context has just come alive and the listener is
definitely waiting for something, and it happens before the first hover,
which is when the key is needed.

not built yet. open before it is:

- what the key actually plays: each channel on its own, sweeping its range,
  or one composite sound walked through its parts.
- whether it needs spoken labels to be a key at all, which would make it the
  first spoken audio in the app, or whether the sounds alone can explain
  themselves if ordered well.
- whether it plays every time sound is enabled or only the first time, and
  whether it can be skipped.
- which conditions it covers: the key for `01` is one sound, and the key for
  `07` is four.

### next

- sketch the key for the current default condition and listen to it before
  deciding any of the above.

---

## Entry 9 — 4 September 2026

### the sound key, built

I said we can implement it. entry 8 left four questions open, and building
it answered them, in the sense that each got a first answer and nobody but
me has listened to any of it.

### decisions made

**each channel on its own, in the order the study added them.** pitch, then
left-right, then the taps, then front-back, then height. a composite sound
walked through its parts would have been shorter, but a listener learning
the mapping needs to hear one thing move while everything else holds still,
and the isolated form falls straight out of the experiment sequence: the key
for 01 is one step, and each condition adds the step for the channel it
added.

**spoken labels, from the browser's own speech engine.** a key that does not
say what a sound means is a demo, not a key. `speechSynthesis` is the first
spoken audio in the app. we went with it over recorded clips because the
labels depend on the condition and the `Mapping` mode, and because a clip
cannot be edited in a text file. the label is said *before* the sound, not
over it. hearing one sound cleanly is the whole point of a step, and speech
on top of it is exactly the competition the key exists to remove. where
there is no speech engine the caption stays up long enough to read and the
sounds play anyway.

**played through the real audio path.** the key is data, an ordered list of
steps each with a `voice(t)`, driven through the same `Sonifier.update()`
the hover calls, at the panel's current settings. so moving `Low` or
`Octaves` or `Taps` changes what the key demonstrates, and the key cannot
describe a mapping other than the one in force. pre-rendering it would have
been easier and would have let it drift.

**every time sound is enabled, and skippable by hovering.** enabling sound
is the one moment the listener is certainly waiting for something and has
not yet hovered. a hover cancels the key rather than fighting it for the
voice: the listener has just said, with the pointer, that they want the real
thing. a `Sound key` button replays it, since a key you can only hear by
toggling sound off and on is half built.

**the tone is muted during the tap steps.** the rhythm and its brightness
are heard on their own, the way `Taps only` presents them, rather than under
a tone at some arbitrary fixed pitch that would itself need explaining.

### ruled out

- **an `aria-live` caption.** the label is shown in a visible caption, but
  not announced through a live region: a screen-reader user would hear it
  twice, once from their own reader and once from the key's speech.
- **speaking over the sound** to halve the length. see above. if the key
  turns out too slow, the fix is shorter labels or shorter sweeps, not
  overlap.

### open questions

- how long is too long? condition 07 is five steps, and a replay timed in
  Chrome on this machine ran 33 seconds end to end, with the spoken labels
  taking about four seconds each and the sweeps two to three. that is more
  speech than sound. nobody has sat through it but me.
- speech engines vary by browser and OS. the labels have been heard on one
  machine.
- whether the height step is audible at all as a key: the window is a
  bounded attenuation, and a sweep of it heard once, on its own, may simply
  sound like a tone.
- whether the key should also be offered to someone who has not enabled
  sound, since it is currently the thing that explains why they would.

### next

- listen to the key for 07 end to end and cut what does not earn its time.
- try it on someone who has not seen the readout rows.

### the voice

added later the same day.

the first runs used the browser's default voice, which on this Mac is
Samantha, the oldest voice macOS ships. I asked if we could get a more
natural sounding voice. the better engines say so in their names: Windows
and Edge label their neural voices `Natural`, macOS labels a downloaded
high-quality voice `Premium` or `Enhanced`, and Chrome carries its own
`Google` voices, streamed from the network. `pickVoice` in
`apps/brainsonify/src/soundkey.ts` ranks those in that order, prefers a US
English voice within each rank and settles for any English, and leaves the
default alone when none is on offer. it runs per utterance rather than once
at startup, because Chrome fills the voice list asynchronously and a choice
made at startup is usually made from an empty list.

this Mac has no `Premium` or `Enhanced` voice installed, so the key now
speaks with `Google US English`. that's a great voice. timed in Chrome on
this machine the same way as before, the five labels of 07 took between 3.8
and 5.1 seconds each, so the change bought naturalness and no time. the
Google voice needs the network, and what the key does when Chrome cannot
reach it has not been tried.

---

## Entry 10 — 4 September 2026

### naming the anatomy

I asked for an atlas, so that named regions get called out on entry. that is
condition 08: everything 07 does, plus a spoken label.

### decisions made

**AAL, from NiiVue's own demo images, fetched at runtime.** the demo volumes
already come from `niivue.github.io` and are not stored in the repo; the
atlas follows the same rule. NiiVue's copy of AAL comes with a label table
in the same place, so there was nothing to transcribe.

**the atlas is loaded as an image but never added to the scene.** adding it
as a second volume would have drawn it, and the opacity and bone channels
read from what the renderer shows. loaded on its own through `NVImage`, it
is invisible and costs nothing at draw time. regions are looked up by world
position through the atlas's own affine, so the scan's grid never has to
match: the MNI152 demo and the atlas are different grids at different
spacings, read from their headers, and the lookup does not care.

**spoken on entry, after a dwell.** the first thought was to speak the name
the moment the label changed. a sweep across the cortex crosses a boundary
every few voxels, and that would have been a stammer of cut-off names. so
the callout waits for the pointer to rest in the region before saying
anything, and a sweep straight across is silent. the dwell is a chosen value
in `atlas.ts`, not a measured one. coming back to a region after leaving it
is announced again, because the question a listener is asking at a boundary
is "which side am I on now", each time.

**side first.** AAL writes `Precentral_L`; the callout says "Left
precentral". the side is the fact most worth hearing and the one most easily
lost if the next region cuts the name short. the rest of the name is AAL's
own word order with the abbreviations spelled out, which is not how an
anatomist would say it. see the open question.

**off for the whole-head T1.** the atlas is in MNI space, and the head scan
is one person in scanner space; looking it up would name regions that are
not there. a file dropped in is assumed to be MNI, because a scan already in
that space is the case worth supporting, and the panel says which it thinks
it has.

**no sound key step.** the key explains sounds a listener could not
otherwise decode. a spoken name decodes itself.

### ruled out

- **NiiVue's own location callback.** it reports the label under the
  crosshair, and the crosshair is deliberately not moved during 2D hover
  sampling, so it never had the information.
- **an `aria-live` region for the name**, for the same reason as the key's
  caption: a screen-reader user would hear it twice.
- **a dimension of sound for the region.** there are over a hundred labels
  and no sonic dimension with that many learnable steps. speech is the one
  channel that already has the vocabulary.

### open questions

- is a spoken name over the texture and taps heard as a label for what the
  ear is following, or does it stop the listening while it is said? nobody
  has tried it yet.
- is the dwell right? it separates passing through from stopping, and only
  listening will say where that line is.
- should the names be a hand-written table rather than AAL's order spelled
  out?
- should the key mention the atlas after all, if only to say that the voice
  will speak?

### next

- hover the MNI152 demo in 08 and check the spoken side against the tile
  labels and against which ear the tone is in.
- try the head T1 in 08 and confirm the row says the atlas is off.

### checked

both of the above, in Chrome on this machine, same day. on the MNI152 demo
the pointer resting on the left side of the coronal tile read `L 47%` in the
pan row and was spoken as `Left postcentral`, in the Google voice, so the
side agrees with the tile. hovering while the key was still playing cut the
key at its fourth label and the region name followed, which is the intended
order. on the head T1 the region row read `off: not an MNI scan` and nothing
was spoken over it. the sweep-stays-silent case is only covered by the unit
test; a pointer driven from the browser tools cannot move fast enough to try
it.

### the voice, in another browser

I heard the old Samantha voice again and asked what had happened. nothing in
the app: Chrome on this Mac still renders `Google US English`, checked by
the fact that the utterance starts about half a second late, fetching from
the network, and fires no word-boundary events, where Samantha starts at
once and does. I had been listening in the browser built into VS Code, which
has no Google voices, so `pickVoice` finds nothing better than the default
there. the nice voice can be heard in Chrome. the same goes for Safari. a
downloaded `Premium` or `Enhanced` macOS voice would fix both, since the
picker ranks those first; none is installed here yet.

---

## Entry 11 — 4 September 2026

### shipped 06 to 08, and a wrong turn in the tooling

okay, we pushed and merged. height, texture, the sound key, the voice and the
region names went out as one commit, `ec159e5`, for the same reason as the
tap-layer commit: the work is tangled across the same files and no split of
it builds and passes on its own. `a0c252c` stamps 06, 07 and 08 with it. main
is fast-forwarded and the pages deploy went through, so the live site opens
on 08 Regions with the key playing when you click Enable sound. we still
haven't run any of the three with a listener. the Result lines in
EXPERIMENTS.md say so.

### what was up with the title

the tab said `brainsonify â 08 Regions` and I asked what was going on. one of
the edits to `main.ts` had gone in through a perl one-liner that wrote an
ellipsis. perl had read the file as bytes, and when it wrote a string that
now held a wide character it re-encoded the whole thing, so every em dash and
ellipsis already in the file came out doubled. twelve of them, in comments,
two status strings and the title template. the check at the time searched for
`â€`, which is what the damage looks like in a Windows-1252 viewer and not
what is on disk, so it found nothing and the edit got called clean. we found
it the next morning and reversed it byte for byte.

two things to take from it. non-ASCII goes in with the editor tool, not a
shell one-liner. and a check for mangled text has to look for the bytes, not
for what the bytes look like somewhere else.

a stale `.git/index.lock` from the afternoon before, empty and with no git
process behind it, blocked the first commit. we removed it by hand.

### next

- listen to 07 and 08 with someone, and fill in their Result lines.
- download one Premium or Enhanced macOS voice and see if the browser in VS
  Code picks it up, since that is where the default voice was heard.

---

## Entry 12 — 15 September 2026

### instructions for the sighted technician, from Monica

Monica, a physical therapist at the Brain Health Institute (where I also work)
and a coach at the F45 gym I go to, suggested this one. every session needs a
sighted person driving the screen while the listener works by ear, and that
person needs their own guide: what to click before headphones go on, how to
move the cut plane, what to say out loud so the listener isn't left guessing
about something only a sighted person can see.

so we wrote TECHNICIAN.md. it covers what to load and which experiment to pick
for a first session, when to click Enable sound (before the listener puts
headphones on, since most browsers gate audio behind a real click and that
click should be the technician's, not a guess), how the two ways of moving the
cut plane differ (the wheel for a small continuous nudge, `c` for jumping to
the next whole plane), and what to narrate out loud when the plane changes,
since that's the one thing about the scene the listener has no other way to
know just happened.

I'm only now getting this logged. the file has been sitting in the repo since
the 15th and I'd forgotten it existed until going back through things today.

### open questions

- none of this has been tried in a real session yet. the guide is reasoned
  about, not tested against an actual technician running it cold.

---

## Entry 13 — 21 September 2026

### the radar sweep reads the cut face now

okay, we had a radar sweep already, but it only walked the crosshair top to
bottom on one axis, the way the crosshair buttons do one axis at a time. what
I wanted was a sweep of the clip plane itself: left to right along a line,
then the next line down, the way a page is read, with the 8 mm spike in play
the whole time so bone just behind the cut still taps.

so we rewrote it. the sweep now reads the face of whatever plane NiiVue is
cut on. NiiVue keeps the plane as a normal and a depth in its own fraction
space, the same 0..1 space `sampleFraction` already speaks, so the face is
just the plane through the point nearest the centre, and we build a frame on
it: "down" is the direction in the face closest to inferior, "across" is
perpendicular to that, pointed toward the right. an axial cut has no inferior
in it, so there the front is at the top and the lines run front to back.
sagittal has no left-right, so its lines run back to front. all of that is in
`sweep.ts` with tests, out of `main.ts`, so it runs without a canvas.

the face is read again every frame rather than once when the sweep starts.
that means the wheel and `c` keep working mid-sweep and the sweep goes with
the plane, which is what the technician would expect: nudge the cut deeper
and the next line comes off the new depth.

the spike didn't need anything new. every sweep point goes through the same
`onSample` a hover does, and that's where `densestVoxel` and the reached bone
map live, so the taps already report the densest bone within the Spike
distance. what "in play" needed was for the sweep to be in a condition that
has the bone channel on, and it is.

### its own condition

it's 10, not a change to 09, for the same reason 09 wasn't a change to 08:
01 through 09 were all described without a sweep button in the panel, and the
button now only shows in 10, so none of them moves. 10 opens on the same
medial coronal cut as 09 and maps the same things. the only difference is who
is moving.

the scan line changed a little. while the sweep runs it's drawn from the left
edge only as far as the sweep has got, like the beam of a scanner, instead of
the full width. the spike line only marks the point when there is bone within
reach, so on soft tissue nothing was showing where the sound was coming from.
a hover still draws the full-width line.

4 seconds a line and 5% of the face between lines are guesses. that's twenty
lines and eighty seconds for a face. we haven't listened at any other
setting. they may want to be sliders.

### is there another way to hear a line of tissue

I asked whether there's another way to encode a line of tissue in sound,
rather than one voxel after another. the ways we came up with:

the line as a chord. every voxel along the line becomes a partial: position
along the line sets its pitch, intensity sets how loud it is, and the whole
line sounds at once as one timbre that changes as the sweep moves down. this
is roughly what the vOICe does for camera images, a column at a time with
height as pitch. in Web Audio it's nearly free: a `PeriodicWave` built from
the line's intensity profile, one oscillator, rebuilt per line. the bone
spike could still tap on top of it. the cost is that pitch is then position,
not intensity, which is the opposite of what every condition so far has
taught the listener.

the line as a fast gesture. play the line's voxels in order but in a fraction
of a second, so a line is a short run rather than a four second walk. the
tissue pattern becomes a contour, bone becomes clicks inside it, and a face
takes seconds instead of a minute. this keeps our mapping as it is and only
changes the pace.

the line as edges. sound only the transitions along the line: a click at each
boundary between tissues. a line through the vault clicks twice near each
side, a line through cortex clicks at every sulcus. very few events, all of
them structure. the bone spike is already a version of this for one tissue.

the line as a mix. how much of the line is bone, gray, white, CSF, as the
levels of a few textures. one sound per line that says what's there and not
where. easy to hear, throws the position away.

the line spread across the ears. sound the whole line at once, each voxel
panned by where it is, as a cloud of short grains. left of the head in the
left ear, all at the same time. probably mush on a line with a lot in it.

none of these are built. if we try one, the fast gesture is the smallest
step from where we are, and the chord is the biggest change in what the
listener has to learn.

### open questions

- is 4 seconds a line the right pace, and does a face need to be shorter than
  eighty seconds for the top of it to still be in mind at the bottom?
- should a line of tissue be one sound rather than a run of voxels? which of
  the ways above, if any, is worth its own condition?
- the sweep only covers the middle unit square of a tilted plane, so on the
  camera-relative Clip slider's plane it can read air at the ends of a line.
  is that fine, given the six presets are what a technician uses?

### next

- listen to 10 on the head T1 with the vault in the line, and see if the ring
  reads as two taps near the top and one at each end through the middle.
- decide whether line time and line step become sliders.
- pick one of the line encodings, or none, and say why in the next entry.
- the next few conditions are sweep experiments. we're trying to perfect the
  sweep idea before adding anything else: pace, what a line sounds like, what
  the technician needs to say. each one gets its own number so 10 stays as
  the first attempt.

---

## Entry 14 — 21 September 2026

### committed, and on to the sweep experiments

okay, we committed the two weeks of work as `206792f`, with `19260c9`
stamping 09 and 10, and a small fix after it for headers in EXPERIMENTS.md
that still said 05 and 07 were the default. the plan from here is sweep
experiments: we're trying to perfect the sweep idea before adding anything
else.

first one is 11, the fast gesture from Entry 13. same sweep, same lines,
half a second a line instead of four, and 0.3 seconds of silence between
lines so a line has a beginning and an end. a face goes by in about
seventeen seconds instead of 84. nothing about the mapping changes, which is
why it was the one to try first.

the pace is three sliders now, Line, Lines and Rest, under the sweep button.
each sweep condition sets them on entry, the way conditions set the Taps
ceiling, so 10 and 11 differ only in where the sliders start. I can move
them mid-sweep and the next frame picks it up.

one correction to Entry 13: I wrote twenty lines and eighty seconds for 10.
the step was 5% of the face and both edges are read, so it's twenty-one
lines and 84 seconds. the log says so now. the entry stands as written.

### what I noticed

at half a second a line the sweep samples at the frame rate, so a line is
about thirty voxels on this machine and fewer on a slower one. that's the
cheap version of a fast gesture. the honest version would schedule a fixed
number of samples on the audio clock, the way the taps already are. not
built; noted in the 11 section.

### open questions

- does a half-second line still carry the tissue pattern, or is it the same
  blur a fast hover gives?
- is 0.3 seconds of rest enough to count lines by?

### next

- listen to 10 and 11 back to back on the head T1 and pick a pace.
- if fast lines read, try faster, and try the line on the audio clock.

---

## Entry 15 — 21 September 2026

### a wider rest, and the lines in the cardinal directions

two small things after looking at 11. the Rest slider only went to a
second, which isn't a wide enough range to find out how long a gap a
listener wants between lines; it goes to 3 seconds now. and I want to try
the sweep running the other ways. the current way is not bad; I just want
to hear the others.

it's a Lines run control with the four cardinal directions: left to right,
right to left, top to bottom, bottom to top. my first cut of this was a
quarter-turn control, the page turned as a whole, which makes the columns
step right to left. I'd rather have the sweeps in the cardinal directions
with the face always covered in the same order: rows step top down,
columns step left to right, whichever way a line reads. then left to right
against right to left is a clean comparison, since only the line changes.

cardinal directions rather than an angle on purpose: every line still
spans the whole face and the first and last still sit on its edges, so
nothing else about the sweep changes. an angled raster would need lines of
different lengths, or silence at their ends, and we haven't heard anything
yet that says it's worth that. the scan line follows, drawn from where the
line began to where the sweep has got.

it's a control, not a condition. 10 and 11 both open reading left to
right. if columns turn out to sound different in a way that matters,
that's a condition; if not, it stays a knob.

### open questions

- does a column down through the vault and the brain tell differently from
  a row across it? a column crosses skull once at the top and never again;
  a row crosses it twice.
- does reading right to left sound like anything but the mirror, or does
  the stereo make it a different thing?
- what rest do listeners actually want at half a second a line?

### next

- listen to 11 with the lines running each way.
- a condition for columns if they earn one.

## Entry 16 — 21 September 2026

### formatting: the render always on screen, and the switcher off the edge

the page had got messy at some window shapes. the eleven switcher tiles
sat in one flex row across a 300px panel, and since each one was allowed
to shrink below its text, every name overran its tile and the last tile
overran the panel. and NiiVue was on its auto setting for the render tile,
which drops the render whenever three planar tiles fill a row, so on a
wide, short window the one tile a session is run from was gone.

the switcher is a wrapping grid now, three columns to a 320px panel, with a
column minimum that fits the longest name on one line. a longer name wraps
at a space, and a single word that outgrows the column breaks rather than
spills. the panel itself no longer scrolls sideways.

the render is set to always show. NiiVue then chooses row, column or grid
by comparing its three planar layouts only, and bolts the render on
afterwards, so for a stage between about one and a half and two times as
wide as tall it picks a row of four where a grid gives bigger tiles. we
make that choice ourselves from the stage's aspect ratio: a row past
twice as wide as tall, a column past twice as tall as wide, a grid
between. worked through with the MNI152 extents the crossovers land in the
same places as for square tiles, so the rule is those two numbers and
nothing about the volume. it runs on a resize observer on the stage, after
NiiVue's own.

two things found on the way. the stage could grow taller than the window
and never shrink back: a canvas's intrinsic size is its backing store,
NiiVue sizes the backing store to the stage, and a grid row's automatic
minimum let the stage follow. min-height zero on the stage and panel, and
a minmax row, stop it. and the whole page could scroll by about a panel's
height with nothing to see: the visually hidden live regions are
absolutely positioned, the panel was not positioned, so they sat at their
in-flow spot measured from the page, past the panel's clip. the panel is
position relative now and they stay inside it.

on checking: the headed tab the extension drives reports itself hidden, so
neither animation frames nor resize observers fire in it. layouts were
checked with a same-origin iframe inside the tab, reloaded at each size,
and the three forced layouts were checked by setting the option by hand.
the observer path itself has only run in the tests' heads and mine; worth
a look with a real window resize.

### next

- resize a real window through the three layouts and watch the render.
- listen to 11 with the lines running each way.

## Entry 17 — 21 September 2026

### the control api lands as a library

the control api written outside the repo is in as libs/control: a schema
of the eighteen panel parameters, a state store that validates, clamps,
emits events and keeps twenty steps of undo, and the public index. the
plan documents that came with it are in docs/control. nothing in the app
uses it yet; that is the next phase, with the virtual controller.

two things changed on the way in. the controller imported the Experiment
type from the sonification lib, where it does not live; it is the app's
registry type. a library must not reach into the app, so the controller
names only the two fields it reads, mode and taps, as an ExperimentPreset,
and the app's experiments satisfy it structurally. and the library's
configs mirror sonification's rather than the ones drafted alongside the
code: that draft pointed at a tsconfig.spec.json this workspace does not
have, and nx here infers the test target from vitest.config.ts.

the strict settings turned up two real bugs as well as type errors. the
single-parameter path passed the previous value where the state listener
expects the previous state, and undo passed the state after the undo as
the one before it. both fixed; undo now also tells the per-parameter
listeners. an empty test run passes for now so the workspace stays green
until the specs are written.

### next

- specs for schema, state and controller.
- the virtual controller, then wire the panel through the api.


---

## Entry 18 — 21 September 2026

### the knob, and a keyboard standing in for it

the app is used by two people at once: a visually impaired listener and a
sighted technician, with some back and forth between them. that settled
the shape of the controller before any code. the listener gets one knob
and turns it; the technician gets buttons that change what turning does.
the ControlSurface in libs/control is that arrangement with nothing
physical in it, and the app has a keyboard driving it now. the physical
device is an elecrow crowpanel 2.1" rotary display; it presents itself
as a bluetooth keyboard and sends the same keys, so the browser never
knows which one it is talking to. docs/control/CROWPANEL.md is the target
for the firmware.

### decisions

pressing the knob never changes anything. it says where the crosshair is,
region first when the atlas fits, or what the focused parameter reads. a
shared device needs one gesture the listener can make freely, whenever
they lose track, without undoing anything, and that is it. the change
gestures are all the technician's.

every button press is announced, into the crosshair live region and out
loud while sound is on, the same rule the region callout keeps. the
listener otherwise has no way to know that the knob now does something
else. numeric nudges stay silent: the sound is the feedback. on and off
and list settings are spoken, since those have no sound of their own.

the key table is the protocol. one table in the app, keys chosen around
the ones niivue reads on a focused canvas so a key never does two things
depending on focus, and a spec that checks the two sets do not overlap.
the physical panel sends the same keys. the numbers 1 to 5 are one button
per mode, 0 cycles for when the numbers are out of reach.

ble hid keyboard first, before serial or gatt. it needs no browser code
and no pairing gesture in the page. serial and gatt are only worth it if
pairing is a problem in the room or the round display should show what
the app says.

the schema was corrected to the panel rather than the panel to the
schema. the draft that came in with the library had a sensitivity
parameter the panel does not have, and ranges and defaults the panel
does not use; the panel is what has been listened to. a spec now reads
index.html and checks every range, step, default and option against the
schema, so they cannot drift again. the default state is derived from
the schema rather than written out a second time.

the panel and the api hold the same values and follow each other, one
hop each way: a value already held is not written again, so neither
direction loops. the panel stays the source of the html; the api is a
second view of it.

### implementation notes

the api rejects a value outside its range rather than clamping it; the
clamp in setParameter is never reached. left as is, since the surface
clamps before it calls.

the running dev server predated the path alias for @brainsonify/control
in tsconfig.base.json, and vite-tsconfig-paths reads that file at
startup, so main.ts failed to load with a resolve error while the
production build passed. a second server on another port picked it up.
the one on 4200 needs a restart.

the knob's status line went stale after a silent numeric turn, since it
was only refreshed on an announcement. it follows the api's state
change now, so a hand on a slider updates it too.

checked headed in chrome: turns move the crosshair and the plane, modes
and focus announce, the sliders follow the knob and the knob line follows
the sliders, keys inside a form control are ignored. not yet listened to
with sound on.

### open questions

- two step-size controls now exist: the select beside the crosshair
  buttons and the knob's own. is that one too many, or is it right that
  the technician's buttons and the listener's knob have separate sizes?
- a large step on a parameter is ten schema steps, which on a 0.05-step
  slider is half its range. is that ever what a technician wants?

### next

- restart the dev server on 4200.
- listen to a session with the knob and sound on: does the spoken mode
  change land over the tone, and is the press readout the right length?
- firmware: the crowpanel as a ble keyboard sending the table in
  CROWPANEL.md.

## Entry 19 — 23 September 2026

### an agent that can take the listener somewhere

the readme has said since the start that the interaction has no way to
navigate to a named structure. this entry is the first way, though not the
one a listener can use alone: an agent connected over mcp asks for a region
by name, and the app puts the crosshair on its centroid and cuts the volume
with a plane through that point. the technician's hand on the panel, done
by a program.

### shape

one bun process in apps/mcp. it serves the mcp endpoint over streamable
http on /mcp and holds a websocket on /app that the browser opens. the
server knows nothing about anatomy: a tool call is one json request written
to the tab and one json response read back, matched by id. everything that
needs the volume, the atlas or the listener happens in the browser, where
those already are. the newest tab to connect wins, since that is the one
the person is looking at, and calls left waiting on an older tab fail
rather than hang.

three tools. list_regions, go_to_region and where_am_i. where_am_i is the
knob press for an agent: it changes nothing and says where things are.

the app side is a controller like the keyboard one, in
controllers/agent.ts, attached in dev always and otherwise by ?agent in the
address. it retries the socket with a backoff up to half a minute, so the
two processes can start in either order.

the part both ends share, and the arithmetic, is in libs/control/src/agent.ts
with no niivue or dom in it: the messages on the wire, matching a region by
label or spoken name, and the depth that puts a plane through a point.

### decisions

the crosshair goes to the centroid, as asked, but not blindly. a curved
region's mean can lie outside it. the label under the centroid is checked,
and when it is not the region's own, the nearest voxel that is becomes the
landing and the reply says so. across all 116 aal regions five snapped:
both olfactory, both cerebellum 7b, and right frontal superior. the rest
land on their own mean.

the plane keeps the orientation already cut when there is one and falls
back to coronal when there is none. a first visit gets a face to land on;
a later one does not throw away the orientation the technician chose. an
agent can name a side or a slice explicitly instead.

the depth comes from niivue's own convention rather than trial. the shader
keeps a clip plane as dot(normal, p - 0.5) + depth = 0 in fraction space,
and the normal is sph2cartDeg of the azimuth plus 180, which is why the
plane named posterior has a normal pointing anterior and why the sweep's
coronal default already used 0.5 - crosshair y. the depth through a point
is the negative of its signed distance from the middle along that normal.
checked in the browser after a sagittal cut through the left anterior
cingulum: the residual was exactly zero, and the crosshair sat on the
exposed face in the render.

navigation is refused on a scan that is not in mni space. the atlas would
name regions that are not there, and an agent would believe it.

the announcement goes through the same path as the knob's, factored into
one announce function: the live region for the screen reader, the voice
while sound is on. the agent's arrival sounds like the technician's move,
which is the point.

the server is bound to loopback only. the socket moves the crosshair of
whoever is listening, and that is not something to put on the network.

### implementation notes

the atlas grew regions() and nearestIn(). the centroid pass is one walk
over the volume, kept for the session; nearest is a full scan and only
runs when a centroid has missed, which a navigation can afford.

bun keeps packages under node_modules/.bun/<pkg>@<ver>/ rather than
hoisted, which is where to look when reading a dependency's source.

the mcp sdk's WebStandardStreamableHTTPServerTransport takes a fetch
Request and returns a Response, which fits Bun.serve without an adapter.
stateless mode, a fresh McpServer per request over the one shared bridge,
as the sdk documents for http without sessions.

the app's WHOLE_PLANES table now derives from PLANE_ANGLES in the control
lib, so the knob's ring and the agent's plane names are one list.

checked headed in chrome with curl against the endpoint: tools list,
where_am_i, list_regions with a filter, go_to_region for every region
with no errors, an unknown name refused in words, and the axial and
sagittal planes landing where they should. the dev server on 4200 was
not running; a fresh one is.

> _To fill in: what it is like to be taken somewhere with sound on. does
> the announcement land over the tone, and is the sample at the centroid a
> useful first sound, or should the arrival play the key?_

the claude desktop app refuses a custom connector over plain http, so it
goes through mcp-remote as a stdio server in claude_desktop_config.json,
with the full path to npx since the app has no shell path. driven over
stdio from a script the bridge initialised, listed the tools and moved the
crosshair to the right hippocampus. not yet tried from cowork itself.

> _To fill in: a real agent client attached, and whether the tool
> descriptions are enough for it to pick a plane sensibly._

### open questions

- the clip slider still ties the plane to the camera when it is above
  zero, so a camera turn after a navigation re-cuts the plane. should a
  navigation zero the slider, or should the slider learn to keep a plane
  through the crosshair?
- the centroid is the mean in the atlas grid, not the medoid or the point
  deepest inside the region. for a thin cortical region the mean sits in
  the middle of a curved sheet and the nearest-voxel snap picks an edge.
  is that where a listener wants to arrive?
- should an agent be able to move the crosshair by millimetres, or step
  through a region's extent, or is naming the region the whole of its job?

### next

- listen to a navigation with sound on.
- attach claude code to the endpoint and try the tools as an agent would.
- the physical knob, still.

---

## Entry 20 — 23 September 2026

### the tiles that cropped, and a socket that could not leave its origin

two things from trying the agent through a browser that is not a plain
window: the tab claude in chrome drives, and the pane inside the desktop
app. both looked like the app was broken. neither was quite that.

### the crop

the 2d tiles came up cropped after a fresh load, at 1440x900, at
1200x1408, at about 800 wide: each slice drawn for a bigger stage than the
one it sat in and cut off at the tile edge. resizing the window once put
it right. the tile math was never wrong. niivue sizes the canvas's drawing
buffer only from its resize observer, and it wraps that callback in
requestAnimationFrame. a page the browser counts as hidden gets no
animation frames and no resize notifications at all, and the tab claude in
chrome drives reports itself hidden even while it is plainly on screen. so
the buffer stayed at whatever size the canvas had when it was attached,
before the pane had settled, the tiles were laid out for that size, and
css stretched the picture into the stage. a later resize fixed it only
when a frame happened to run.

confirmed by faking stage sizes in that tab: the stage changed, the buffer
did not, until a screenshot forced a frame and everything snapped into
place. a screenshot as a side effect was not on my list.

### decisions

- the app sizes the buffer itself, synchronously. the layout observer that
  already picked row, grid or column now also compares the buffer to the
  stage times the pixel ratio, and when they differ calls niivue's
  resizeListener, which does the resize niivue would have done, without
  waiting for a frame. it runs from the resize observer and the window's
  resize event as before, on visibilitychange, after every volume load,
  and at the top of the two agent calls that draw. an agent that asks
  where it is, or goes somewhere, is about to have its picture looked at;
  that is when the fit has to be right.
- resizeListener is marked internal in niivue's typings but it is exported
  and typed, and it is the very function niivue calls from its own
  observer. calling it is a smaller change than copying the pixel-ratio
  and viewport dance next to it. if an upgrade hides it the typecheck
  will say so.

### ruled out

- waiting for niivue's own path with a forced frame. a hidden document
  never gets one, so there is nothing to wait for.
- patching niivue, or handing it different observer options. the observer
  is fine whenever frames run; the wrong assumption is that they will.
- a layout that sidesteps the buffer size. every 2d tile is laid out in
  buffer pixels. there is no such layout.

### the socket

the desktop app's pane lets a page talk to its own origin and nothing
else, so the socket to 4242 was refused before it left. the dev server now
proxies /agent to the server's /app, and the controller tries the page's
own origin first, then the direct address, alternating with the same
backoff as before. the ?agent= override still names one address and tries
only that. one console line when the server is reached and one when the
retry settles at thirty seconds; the browser prints its own line per
refused attempt and a page cannot suppress that.

checked from claude in chrome: connected through the proxy, where_am_i and
go_to_region landed in the tab, direct mode through ?agent= still
connects, and with the server stopped the warning came once and the tab
reconnected by itself after a restart, on the direct address as it
happened, since that was the next in turn.

> _To fill in: the same page opened in the desktop app's pane, which is
> where the socket was first refused. the chrome tab stands in for it here
> because it is hidden the same way; the pane has not been tried since._

### open questions

- three tabs were connected at once during this, two of them forgotten in
  other browsers, and the newest one answered. a tool call that lands in
  a tab nobody is looking at is a confusing failure. should the server say
  which tab it is talking to, or should a tab announce when another takes
  over?
- is sizing before every agent draw the right shape regardless of the
  pane, since a headless viewer has the same problem?

### next

- open it in the desktop app's pane and look.
- the physical knob, still.

---

## Entry 21 — 23 September 2026

### saying the regions the way an anatomist would

the spoken names were built from the AAL labels by spelling out the
abbreviations in the order the label has them: Frontal_Inf_Tri_L came out
as "Left frontal inferior triangular". an anatomist says "left inferior
frontal gyrus, triangular part", and the generated names dropped "gyrus"
everywhere, which is the word that tells a listener what kind of thing
they are in. so the names are now a hand-written table, one entry per
stem, expanded to both sides, with the vermis on its own since it has no
side.

### decisions

- a table, not a smarter generator. the label order and the english
  order disagree region by region (Frontal_Sup_Medial is "superior
  frontal gyrus, medial part"; Temporal_Pole_Sup is "temporal pole,
  superior part") and there are only 116 of them. a table can be read
  and corrected by someone who knows the anatomy and not the code.
- the generated name stays, twice over. it is the fallback for any label
  the table does not know, so a different atlas or a renamed label still
  gets said, and it is kept on each region as an alias, so an agent that
  learnt "left frontal inferior triangular" from an earlier list still
  lands. list_regions does not report the alias; the agent gets the
  table's name and the label.
- lowercase, as spoken, apart from names that are names: Heschl's,
  Rolandic. the old names capitalised the first word. the name is heard
  far more than it is read.

### ruled out

- keeping the AAL paper's exact strings ("Inferior parietal, but
  supramarginal and angular gyri"). they are written for a table, not
  for an ear. "inferior parietal lobule" says the same thing in the time
  a listener has.

> _To fill in: a few names are choices rather than the one standard
> form: "calcarine cortex" for Calcarine, "globus pallidus" for Pallidum,
> "temporal pole, superior part" for Temporal_Pole_Sup. worth a pass by
> someone who says these aloud for a living._

### next

- hear a full sweep with the new names and see whether the longer ones
  get cut short by the next region at the current dwell.

## Entry 22 — 23 September 2026

### turning to face the cut

go_to_region Hippocampus_R plane=right cut the right side off through the
hippocampus, and the render kept looking from the left, where the default
camera sits. from there the left side is intact and the face with the
region on it is round the back. the cut was right; nobody had turned the
camera. so now the camera turns to face the cut, in go_to_region and in
the two manual whole-plane moves, the knob's `n` and NiiVue's own `c`
over the render. turning the plane off leaves the camera alone.

which angles face a cut was the whole of the work. NiiVue's shader keeps
the side the plane's normal points to, so the face looks back along the
normal, and the camera that sees it square on is the one whose view
direction is the normal. NiiVue builds its view from a mirrored x, a tilt
of 270 minus the elevation and a turn of the azimuth minus 180; the
inverse of that on the screen's depth axis comes out as a compass bearing
tilted by the elevation, and matching it term by term against the clip
normal gives the plane's own elevation and its azimuth turned the other
way. right (azimuth 90) is faced from 270. the same rule is now in the
control lib as cameraForPlane, with viewDirection beside it so the test
can check the two agree for any angles, not just the six.

### checked on screen

- right through the hippocampus: sagittal face square on, nose to the
  right, as a view from the right should be. a depth pick at the
  crosshair read 28, -20, -11, right hippocampus, which is on the face.
  before the turn it would have been left scalp.
- superior: axial face from above, front at the top. picks along the face
  read z = -12 with the plane at -11, so the pick lands on the face and
  not on the far side.
- posterior: coronal face from behind.
- `c` twice from there: left then right, each faced from its own side.

### decisions

- the camera turns before the plane is cut. a camera turn fires
  onAzimuthElevationChange, and with the clip slider above zero that
  re-cuts the plane the slider's way; cutting second means the plane
  through the crosshair wins. the slider still re-cuts on the next camera
  drag, as before.
- NiiVue cuts on `c` from its keyup listener, not keydown. found that out
  the first time the key did nothing for the camera: my listener ran on
  keydown, read the old plane and faced that. now it is a keyup listener
  added after NiiVue's, so it runs after the cut.
- manual plane changes turn too. the plane exists to expose a face, and a
  depth pick only reaches the face from the side the cut took off; from
  the kept side the pointer reads the outside. a technician who has
  dragged the render to some angle gets snapped back on the next whole
  plane, which seemed the smaller surprise.
- the technician doc's list of what `c` shows was the wrong way round: it
  said left "hides the right hemisphere, shows the left", and on screen
  the left preset takes the left off and shows the right hemisphere's
  medial face. rewritten to name the side taken off and the side faced
  from.

> _To fill in: whether a listener wants to hear that the view turned. the
> announcement says where the crosshair is; the camera is a sighted
> thing, so for now it is not said._

### open questions

- the clip slider ties its plane to the camera as azimuth plus 180 and
  the elevation negated. by the rule above the plane that faces a camera
  is azimuth negated, elevation kept; the two agree only for side views.
  not checked on screen, and the slider's own workflow was not touched.

---

## Entry 23 — 23 September 2026

### onto NiiVue 1.0 (1.0.0-rc.14)

NiiVue cut 1.0.0-rc.14 from niivue/mono today and we moved brainsonify onto
it, on its own branch, `feat/niivue-1.0`. it is a release candidate on npm's
`next` tag; `latest` is still 0.69.0.

> _To fill in: why now, on a release candidate, rather than waiting for 1.0
> itself._

1.0 is a rewrite, not a bump. the first typecheck said 13 errors, but that was
only because `Niivue` had become `NiiVue` and every `nv.` behind it was `any`.
with the name fixed it was 63. almost all of it was the app reaching into
things 0.69 left lying about: `scene`, `screenSlices`, `uiData`,
`calculateMvpMatrix`, `drawLine`, `getValue`, `cmapper`. none of those are on
the 1.0 controller.

### what replaced what

- hover on a 2D tile is `clientToCanvas`, `hitTest`, `canvasToMM`.
- the render pick is the view's `depthPick`, which is what NiiVue's own
  double-click calls. it has its own pass and gives back mm or null. the
  whole dance of hiding the 3D crosshair, redrawing and comparing
  `crosshairPos` references is gone. the crosshair is not in the pick pass
  any more, so there is nothing to hide, and a miss is a null.
- voxel reads, mm/voxel, and the colormap table are in a new
  `geometry.ts`, because 1.0 has them but does not export them. each one
  copies the NiiVue code it replaces: `getValue` from 0.69 (clamped, scaled),
  `lutrgba8` and `mat4.invert` from 1.0.
- the surface search walks the ray through the pixel, unprojected through
  the render tile's MVP, instead of `calculateRayDirection`, which is gone.
- the atlas loads with nifti-reader-js and NiiVue's exported `nii2volume`.
  1.0 only loads volumes into a view.
- the spike and scan line are on a second canvas over NiiVue's.

### found the hard way

- NiiVue swaps the canvas. with no WebGPU it falls back to WebGL2 by cloning
  the canvas and replacing it, because a canvas that has held a WebGPU
  context cannot take a WebGL2 one. `main.ts` held the old element, so hover,
  resize and the overlay all listened to a canvas that was no longer in the
  page. the page drew fine and nothing responded. now the canvas is always
  looked up through `nv.canvas`, and the pointer listeners are on the stage.
- `nv.devicePixelRatio` is -1 when NiiVue is left to choose. multiplying by
  it sent every hover off the canvas. `clientToCanvas` does the conversion
  properly.
- the overlay hook (`registerOverlayRenderer`) looked like the right home for
  the lines, but it hands over a raw WebGPU pass, and the WebGL2 view never
  calls it. so the lines are redrawn a frame after NiiVue's frames and after
  its camera, resize and clip events. they follow a rotate now, which in 0.69
  they did not.
- NiiVue's `c` is on keydown now, from a window listener that only fires with
  the pointer over the canvas. our keyup listener still runs after it and
  still turns the camera. it follows the same rules now.
- `v` stopped changing views. 1.0 ships `isViewModeHotKeyEnabled` off, and
  a press then only logs NiiVue's version, so nothing looked wrong except
  that the view stayed put. it is switched on in the constructor now. like
  `c`, it only answers with the pointer over the canvas.
- `c` walks a different ring in 1.0: off, posterior, right, left, anterior,
  inferior, superior. the knob's next plane still walked the old one, left
  first, so the two went out of step. and `c` steps its own counter
  (`currentClipPlaneIndex`) rather than reading the plane, so a plane set any
  other way left the next `c` stepping on from wherever `c` last was. the
  knob follows NiiVue's order now, and every `clipPlaneChange` puts the
  counter back on the plane that is cut.

### changed behavior, not fixed

- a ray that goes only through cut-away space is no longer a miss. 1.0
  falls back to the point where the ray meets the clip plane. in 0.69 it
  came back as id 253 and the opened cavity was silent. now it sounds the
  voxel on the plane, which is mostly background and gated off, but not
  always.
- the pick refines to single steps after its 1.9-voxel march and packs a
  real depth, where 0.69 packed 8 bits per axis. so the surface it finds
  should be tighter than the one `Surface` was tuned against.

### checked on screen

headless chrome with SwiftShader, so WebGL2, MNI152 demo, condition 11:
2D hover read 25.4 at -7, -17, 23. the render read 54.4 marked "3D render".
the scan line was drawn on all four tiles and moved with a drag. `c` cut
coronal, sagittal from the left, sagittal from the right, and the camera
turned to 0, 270, 90. a pick on the sagittal cut read 2, -19, 5, right
thalamus. no console errors apart from the agent socket, which has no
server in dev, and the favicon.

not checked: a real GPU, WebGPU, sound.

### open questions

- should a pick that lands on the clip plane with nothing behind it be
  silent, as it was?
- is the `Surface` default still right now the pick is tighter?
- does anything look different on WebGPU, which is what most visitors'
  browsers will pick?

### next

- open the branch in chrome on a real GPU, with sound, and hover the
  render and the cut.
- listen to the whole-head T1 with the clip slider up, since that is
  where the cavity change shows.
