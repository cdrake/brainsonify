# brainsonify

Non-visual exploration of volumetric medical images. Move the pointer over an
MRI and hear the tissue underneath: pitch tracks voxel intensity, so sweeping
across the cortical ribbon produces an audible dip at every sulcus.

Built on [NiiVue](https://github.com/niivue/niivue). Early spike for an
ITEC 444 (Human-Computer Interaction) project at the University of South Carolina.

**Live demo:** https://cdrake.github.io/brainsonify/

## Why

Medical and scientific imaging is almost entirely visual. Someone who cannot see
the screen has no practical way to explore a 3D scan. This is an experiment in
whether an auditory channel can carry enough of the structure to be useful.

The longer-term aim is to pair the audio with a bone-conduction transducer so the
same signal is felt as well as heard, and to add spoken structure labels from an
atlas registered to the same space.

## Getting started

Requires [Bun](https://bun.sh) 1.2+.

```bash
bun install
bun run dev        # http://localhost:4200
```

Other tasks, all routed through [Nx](https://nx.dev):

```bash
bun run build      # production bundle -> dist/apps/brainsonify
bun run preview    # serve that bundle at http://localhost:4300
bun run test       # vitest, across every project that has tests
bun run typecheck  # tsc --noEmit, across every project
bun run graph      # open the project graph
```

Nx caches task results, so a second `bun run build` with nothing changed is a
cache hit rather than a rebuild.

## Layout

```
apps/brainsonify/   Vite app: NiiVue canvas, pointer sampling, control panel
libs/sonification/  Framework-free audio core: intensity -> frequency, Web Audio voice
```

The split is deliberate: everything in `libs/sonification` is pure TypeScript with
no DOM or NiiVue dependency, which is what makes the mapping unit-testable.

| Module | Responsibility |
|---|---|
| `libs/sonification/src/mapping.ts` | Intensity window → normalised value → frequency |
| `libs/sonification/src/audio.ts` | `Sonifier`: sine or band-passed pink noise, gated, plus the tap layer |
| `libs/sonification/src/rhythm.ts` | Colormap alpha → opacity → tap rate, and the contrast curve |
| `libs/sonification/src/loudness.ts` | Equal-loudness weighting, so pitch does not double as level |
| `libs/sonification/src/key.ts` | The sound key: one spoken-and-sounded step per active channel |
| `apps/brainsonify/src/experiments.ts` | The experiment registry: conditions, channels, URL |
| `apps/brainsonify/src/boneness.ts` | Hessian sheetness + surface alignment → how bone-like a voxel is |
| `apps/brainsonify/src/boneness.worker.ts` | Runs that map off the main thread, once per volume |
| `apps/brainsonify/src/sampler.ts` | Pointer position → voxel intensity, 2D and 3D |
| `apps/brainsonify/src/ui.ts` | Control panel and live readout |
| `apps/brainsonify/src/soundkey.ts` | Plays the key: says each label, then drives the voice through its sweep |
| `apps/brainsonify/src/atlas.ts` | The AAL atlas: world position to region name, spoken on entry |
| `apps/brainsonify/src/main.ts` | Wiring, volume loading, drag and drop |

## Experiments

The app ships every experiment in one build. Visiting it with no experiment in
the URL gives the most recent condition; the switcher at the top of the panel
links to the earlier ones, and each has a stable URL:

```
?experiment=01-pitch     pitch tracks intensity, mono
?experiment=02-stereo    + stereo carries anatomical left-right
?experiment=03-rhythm    + tap rate follows opacity
?experiment=04-bone      tap rate follows boneness instead
?experiment=05-depth     + tap brightness carries front-back
?experiment=06-height    + loudness carries inferior-superior
?experiment=07-texture   white noise: brightness carries intensity, not pitch
?experiment=08-regions   + the AAL region under the pointer is spoken     (default)
```

Switching does not reload: a volume you dropped in survives the change, which is
the point when you are comparing two mappings of the same scan. Controls and
readout rows belonging to a channel the condition does not use are hidden rather
than left dead, and the change is announced for a listener who cannot see it.

[EXPERIMENTS.md](EXPERIMENTS.md) is the log — what each condition maps, what to
listen for, and what it showed. `apps/brainsonify/src/experiments.ts` is the
registry that drives the switcher, the default, and the visible controls.

## How it works

- **2D slices.** `canvasPos2frac` converts pointer position to a fractional
  volume coordinate, `frac2vox` gives voxel indices, `getValue` reads intensity.
  The crosshair is not moved.
- **3D render.** `canvasPos2frac` returns -1 over the render tile, so the app
  sets `uiData.mouseDepthPicker` and calls `drawScene()`. NiiVue reads the depth
  buffer during that draw and updates `scene.crosshairPos`, which is then
  sampled. Throttled to one pick per animation frame, since each pick costs a
  full redraw.
- **Why the render needs a surface search.** The picking shader marches in steps
  of ~1.9 voxels and stops at the first sample whose colormap alpha exceeds
  0.01, then encodes that position into 8 bits per axis. The point it hands back
  is therefore the faint outer rim where tissue merely becomes *visible*, plus a
  voxel or two of quantisation — hover a bright gyral crown and you can easily
  read the air in front of it. `Surface` searches that many voxels along the view
  ray and keeps the strongest value. The search is one-dimensional on purpose:
  widening it into a box would blur across the sulci, which are the features this
  whole thing exists to make audible. 2D tiles never do this — they are an exact
  single-voxel read.
- **Clipping to get inside.** On a whole-head scan the scalp and skull wrap
  everything, so the depth picker can only ever land on the outside — the render
  is a face, not a brain. `Clip` cuts the near side away, and because the picking
  shader honors clip planes (`clipSampleRange` skips clipped samples) the pick
  then lands on whatever the cut exposes. The plane's normal is the camera's own
  angles flipped, so the opening faces the viewer and keeps facing them through a
  rotation instead of swinging round to the far side. A ray that passes only
  through cut-away space reports id 253 rather than a volume hit, so hovering the
  opened cavity is correctly silent.
- **Finding bone without intensity.** Cortical bone is a signal void on a T1 —
  the darkest thing in the head — so nothing about its intensity identifies it.
  What is distinctive is its shape: a thin dark sheet lying parallel to the
  scalp. `boneness.ts` scores plate-likeness from the eigenvalues of the
  smoothed Hessian, then multiplies by how closely the sheet's normal aligns
  with the gradient of a distance-from-scalp field. That second term is what
  separates skull from sulcal CSF, which is also a thin dark sheet but runs
  inward rather than wrapping the head. The response is mapped through a fixed
  window rather than each volume's own maximum, so a skull-stripped scan stays
  quiet instead of rattling at whatever its loudest voxel happens to be.
- **Front-back cannot be panned.** A source ahead and a source behind give the
  ears the same arrival-time and level difference — the cone of confusion — so
  stereo carries left-right and nothing else. What separates front from back in
  life is the pinna filtering sound arriving from behind, which is a spectral
  cue, so depth rides the *color* of the tap rather than its position: anterior
  taps are struck through a band an octave above center and read bright and
  clicky, posterior taps an octave below and read dull. A tap is a broadband
  burst and carries a spectral cue well; a sine would only change hue. The band
  is geometric about 1800 Hz, and each strike is weighted by the loudness curve
  at the band it is actually struck through — a fixed level would make anterior
  taps audibly louder as well as brighter, which is two cues that can disagree.
- **Height uses a loudness window.** World Z maps inferior to superior as a
  signed position. The output gain moves from 0.6 at the inferior extreme to
  1.0 at the superior extreme, with the master `Volume` control remaining the
  overall ceiling. This leaves pitch for intensity and tap brightness for
  front-back.
- **A measurement is not a probe.** Read at a point, that map is unusable: the
  skull is a 4-7mm shell, so 49 of 46,224 sample points land on it, and on the
  3D render the depth pick lands on the *scalp* with the bone several
  millimeters beneath — the one view the channel exists for could never sound
  bone at all. `Spike` sets a reach, and `reach()` widens the map so every voxel
  reports the strongest bone within that distance, the way pressing on your own
  head finds the skull under it. At the 8mm default the target grows 53-fold and
  a third of scalp points sound the vault under them. The cost is real and is
  the point of making it adjustable: cortex within 8mm of the inner table
  reports bone too, so the boundary softens as the probe lengthens.
- **The probe is drawn, not just heard.** A condition that taps on bone also
  draws a line on the 2D tiles from the sampled voxel to the full-resolution
  voxel `reach()` actually reported — `densestVoxel()` in `boneness.ts` decodes
  it back from an index the widening filter carries alongside the value, the
  same way a chain of sliding-window maximums can carry an argmax. The two
  ends are rarely on the slice a tile is currently showing, so the line is
  projected onto each tile's plane with the app's own `projectToTile()` rather
  than NiiVue's `frac2canvasPos`, which refuses anything more than ~2mm off
  the current slice — the right call for its own click-to-measure ruler, the
  wrong one for a probe that by design reaches past the slice you are looking
  at.
- **Missed picks.** On a miss NiiVue leaves `scene.crosshairPos` untouched rather
  than signalling failure, so the app compares the object reference across the
  draw. Without that check, hovering off the head keeps sounding the last voxel
  that was hit.
- **Audio.** A Web Audio oscillator, band-passed pink noise, or low-passed
  white noise, whose frequency (or cutoff) is set from the normalised
  intensity, with a configurable glide and a gate that silences background
  voxels. All three sources run continuously — each behind its own gain, only
  one open at a time — and the gate rides the shared output gain, which avoids
  clicks either way.
- **The sound key.** Every condition assumes the listener knows what the
  sounds mean, and a listener working by ear has no readout rows to learn it
  from. So enabling sound plays a key: one step per active channel, in the
  order the study added them, each announced by the browser's own speech
  engine and then sounded with every other channel held neutral. Pitch sweeps
  its range, the image pans left to right, the taps run from their slowest
  rate to their fastest with the tone muted, and so on. The key is built from
  the panel's current settings and played through the same `Sonifier` the
  hover uses, so it cannot describe a mapping other than the one in force.
  Hovering cuts it short; `Sound key` plays it again. The speech uses the
  most natural English voice the browser offers (`Natural`, `Premium` or
  `Enhanced`, then Chrome's Google voices), and the platform default when
  there is none. The Google voices are Chrome's own: Safari and the browser
  built into VS Code do not have them, and on a Mac with no `Premium` or
  `Enhanced` voice downloaded they fall back to Samantha.
- **Region names.** Condition 08 looks the voxel under the pointer up in the
  AAL atlas and says the region's name when the pointer enters it, over
  whatever else is sounding. The atlas is NiiVue's own copy, fetched at
  runtime like the demo volumes and never added to the scene: it is looked
  up by world position through its own affine, so the scan's grid never has
  to match it. A name is spoken only once the pointer has rested in the
  region for a moment, so a sweep across the cortex stays quiet rather than
  stammering fragments; the same voice as the sound key says it, side first.
  AAL is in MNI space, so the lookup is on for the MNI152 demo and for a
  dropped-in file, which is assumed to be MNI, and off for the whole-head T1.
- **Reading a rhythm takes time.** Two rates are compared by counting, and
  counting costs taps: telling 1.2/s from 3.9/s means waiting out two or three
  of each, close to a second, by which time the pointer has usually moved. The
  `Rate` coefficient multiplies the whole scale and leaves every ratio in it
  untouched, which buys that time back — the same contrast, legible at a
  glance. The cost is that the fast end climbs towards a flutter, so the tap
  envelope shortens as the rate rises (`tapLength`) and keeps a gap of silence
  between taps at any rate rather than smearing into continuous noise.
- **Equal loudness.** Ear sensitivity rises about 19 dB between 110 Hz and
  1760 Hz, so a sine at constant amplitude gets louder and harsher as it climbs.
  That is tiring over a continuous hover, and it makes loudness a second,
  exaggerated copy of intensity — the listener cannot tell which one they are
  hearing. `loudnessGain` attenuates towards the sensitive band (never boosts,
  so it costs no headroom) using 0.7 of the A-weighting curve: applying it whole
  would equalise for 40-phon listening, which is quieter than anyone actually
  explores at. The taps get the same treatment, since 1800 Hz sits near the peak
  of the ear's sensitivity and a tap at full scale was some 13 dB louder than a
  low tone at full scale.

## Controls

| Control | Effect |
|---|---|
| Mapping | Sine pitch, pink noise band-passed at the mapped frequency, or white noise low-passed at it (brightness carries intensity, unpitched) |
| Low | Frequency at intensity 0 |
| Octaves | How much pitch range the intensity span covers |
| Gate | Normalised intensity below which output is silenced |
| Surface | Voxels searched inward from a 3D render hit; 0 reads the picked voxel raw |
| Clip | Cuts the near side off the render so the pointer can reach inside the head |
| Volume | Master output level |
| Stereo | Width of the anatomical left–right field, mono to hard-panned |
| Depth | Spread of the front–back field, flat to a full two octaves of tap color |
| Height | Loudness window for anatomical inferior–superior position |
| Taps | Fastest tap rate, at the top of the driver's range; each condition sets its own default |
| Spike | How far the bone probe reaches; the tapping reports the densest bone within it, and a line on the 2D tiles shows where |
| Rate | Multiplies the whole rhythm, so the same contrast arrives sooner |
| Taps only | Mutes the tone and leaves the density channel on its own |
| Sound key | Replays the spoken key to the active condition's sounds; it also plays whenever sound is enabled |
| Glide | Smoothing time on frequency changes |
| Sonify the 3D render | Enables depth picking on the render tile |

Drop a `.nii` / `.nii.gz` anywhere on the page to load your own volume. Two
demo volumes are fetched from `niivue.github.io` at runtime and are not stored
in this repo: MNI152, which is skull-stripped, and a whole-head T1 that keeps
scalp, marrow and the skull's signal void — the wider opacity range the rhythm
channel is meant to carry, and the only one of the two with a skull for the bone
channel to find.

## Deployment

Pushes to `main` build the app and publish `dist/apps/brainsonify` to GitHub
Pages via `.github/workflows/deploy.yml`. Vite is configured with `base: "./"`,
so the bundle works from any subpath without hardcoding the repo name.

## Status

Spike. The mapping is unvalidated — no condition in [EXPERIMENTS.md](EXPERIMENTS.md)
has been run with listeners yet — and the interaction still has no way to
navigate to a named structure, which is the harder and more interesting problem.

## Credits

NiiVue is developed by the NiiVue contributors and distributed under the
BSD-2-Clause license.
