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
| `libs/sonification/src/rhythm.ts` | Colormap alpha → opacity → tap rate |
| `libs/sonification/src/loudness.ts` | Equal-loudness weighting, so pitch does not double as level |
| `apps/brainsonify/src/experiments.ts` | The experiment registry: conditions, channels, URL |
| `apps/brainsonify/src/sampler.ts` | Pointer position → voxel intensity, 2D and 3D |
| `apps/brainsonify/src/ui.ts` | Control panel and live readout |
| `apps/brainsonify/src/main.ts` | Wiring, volume loading, drag and drop |

## Experiments

The app ships every experiment in one build. Visiting it with no experiment in
the URL gives the most recent condition; the switcher at the top of the panel
links to the earlier ones, and each has a stable URL:

```
?experiment=01-pitch     pitch tracks intensity, mono
?experiment=02-stereo    + stereo carries anatomical left-right
?experiment=03-rhythm    + tap rate follows opacity               (default)
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
  shader honours clip planes (`clipSampleRange` skips clipped samples) the pick
  then lands on whatever the cut exposes. The plane's normal is the camera's own
  angles flipped, so the opening faces the viewer and keeps facing them through a
  rotation instead of swinging round to the far side. A ray that passes only
  through cut-away space reports id 253 rather than a volume hit, so hovering the
  opened cavity is correctly silent.
- **Missed picks.** On a miss NiiVue leaves `scene.crosshairPos` untouched rather
  than signalling failure, so the app compares the object reference across the
  draw. Without that check, hovering off the head keeps sounding the last voxel
  that was hit.
- **Audio.** A Web Audio oscillator (or band-passed pink noise) whose frequency
  is set from the normalised intensity, with a configurable glide and a gate that
  silences background voxels. Both sources run continuously and the gate rides
  the output gain, which avoids clicks.
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
| Pure tone / filtered noise | Sine pitch, or noise band-passed at the mapped frequency |
| Low | Frequency at intensity 0 |
| Octaves | How much pitch range the intensity span covers |
| Gate | Normalised intensity below which output is silenced |
| Surface | Voxels searched inward from a 3D render hit; 0 reads the picked voxel raw |
| Clip | Cuts the near side off the render so the pointer can reach inside the head |
| Volume | Master output level |
| Stereo | Width of the anatomical left–right field, mono to hard-panned |
| Taps | Fastest tap rate, at full opacity; the floor is fixed at 1.5/s |
| Glide | Smoothing time on frequency changes |
| Sonify the 3D render | Enables depth picking on the render tile |

Drop a `.nii` / `.nii.gz` anywhere on the page to load your own volume. Two
demo volumes are fetched from `niivue.github.io` at runtime and are not stored
in this repo: MNI152, which is skull-stripped, and a whole-head T1 that keeps
scalp, marrow and the skull's signal void — the wider opacity range the rhythm
channel is meant to carry.

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
