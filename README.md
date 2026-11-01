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

Requires [Bun](https://bun.sh) 1.2+, git, and a desktop Chrome, Edge or
Safari (WebGL2 and Web Audio; the spoken parts sound best in Chrome).
Nothing else needs installing: NiiVue comes from npm and the demo volumes
are fetched from `niivue.github.io` at runtime, so the first load needs a
network connection.

```bash
git clone https://github.com/cdrake/brainsonify.git
cd brainsonify
bun install
bun run dev        # http://localhost:4200
```

Open http://localhost:4200, click through **Starting a session** (or
**Skip**), click **Enable sound**, and move the pointer over the brain.
[TECHNICIAN.md](TECHNICIAN.md) is the guide for running a session with a
listener.

### A zip that runs without any of this

```bash
bun run package    # -> dist/package/brainsonify.zip
```

builds one zip (180 to 250 MB; 179 MB on macOS, 252 MB from a Linux build)
for someone with no Bun, git or network: the
production page, the four images it loads (the MNI152 and head T1 volumes,
the AAL atlas and its labels, downloaded at package time and pointed at by
`VITE_IMAGES`), and a launcher compiled with `bun build --compile` for
Apple silicon and Intel Macs, Windows, and Linux x64 and arm64 (glibc)
(`apps/mcp/src/launcher.ts`). The launchers are most of the size, 64 to
118 MB each. The launcher serves the page on http://127.0.0.1:4200, relays
the page's `/agent` socket to the MCP server on :4242 as the Vite proxy does
in development, and opens the browser with the Virtual Helm showing. The zip's `README.txt`
(`scripts/package-README.txt`) tells the user which file to double-click and
how to get past the unsigned-app warning on first run. Packaging needs the
`zip` command, so run it on macOS or Linux.

### Letting an agent drive it

Run the MCP server in a second terminal, then open the page with `?agent`
so it connects:

```bash
bun run mcp        # http://127.0.0.1:4242/mcp; status page at http://127.0.0.1:4242/
# browser: http://localhost:4200/?agent
claude mcp add --transport http niivue http://127.0.0.1:4242/mcp
```

Keep the page's tab in front; a background tab gets no animation frames.
[apps/mcp/docs/connecting-agents.md](apps/mcp/docs/connecting-agents.md)
covers other clients and what to check when a call fails.

### NiiVue versions

`@niivue/niivue`, `@niivue/uikit` and `@niivue/nv-mcp` are pinned to exact
release candidates in `apps/brainsonify/package.json` and
`apps/mcp/package.json`. The three are released together from the NiiVue
[mono repository](https://github.com/niivue/mono) and each pins the others
as an exact peer, so move them as a set: the versions published together
under one mono release tag (`git tag --list 'niivue@*'` in mono). Pre-1.0
releases change API between candidates, so a caret range would break a fresh
install the day a new candidate lands.

### Developing against a NiiVue checkout

To change NiiVue and see it in brainsonify, clone mono next to this repository
and link its packages in place of the npm ones. Check out the tag matching the
pinned versions, or a newer commit if you are moving brainsonify forward:

```bash
git clone https://github.com/niivue/mono.git niivue
cd niivue
git checkout niivue@1.0.0-rc.63
bun install
for p in niivue uikit nv-mcp; do (cd packages/$p && bun run build && bun link); done

cd ../brainsonify
sed -i.bak -E 's#"(@niivue/(niivue|uikit|nv-mcp))": "[^"]+"#"\1": "link:\1"#' apps/*/package.json
rm apps/*/package.json.bak
bun install
bun run dev -- --force
```

brainsonify imports mono's packages from their `dist`, so rebuild the package
in mono after a change there. `bun link <package>` run inside an app does not
work in this workspace; switching the specifiers to `link:` is the way. Don't
commit the `link:` specifiers or the lockfile they produce; CI installs with
`--frozen-lockfile` on a machine with no checkout. To go back to npm:

```bash
git checkout -- apps/brainsonify/package.json apps/mcp/package.json bun.lock
bun install
```

When the linked work is released, set the pins to the new versions and run
`bun install` to update the lockfile.

Vite caches pre-bundled dependencies in `node_modules/.vite`. When switching
between branches that pin different NiiVue versions it can keep serving the
old one (the page then fails to import from `@niivue/niivue`); start with
`bun run dev -- --force` to rebuild it.

Other tasks, all routed through [Nx](https://nx.dev):

```bash
bun run build      # production bundle -> dist/apps/brainsonify
bun run preview    # serve that bundle at http://localhost:4300
bun run mcp        # the MCP server agents connect to, on http://127.0.0.1:4242/mcp
bun run test       # vitest, across every project that has tests
bun run typecheck  # tsc --noEmit, across every project
bun run graph      # open the project graph
```

Nx caches task results, so a second `bun run build` with nothing changed is a
cache hit rather than a rebuild.

## Layout

```
apps/brainsonify/   Vite app: NiiVue canvas, pointer sampling, control panel
apps/mcp/           Bun process: the MCP server agents connect to, the NiiVue core plus the sound tools
libs/sonification/  Framework-free audio core: intensity -> frequency, Web Audio voice
libs/control/       Control API: the parameter schema, a state store with events and undo, the Helm surface
```

NiiVue, its UI kit and the generic NiiVue MCP core (`@niivue/nv-mcp`: tabs,
the core tools, plane math, region matching; it knows nothing of brainsonify)
come from the NiiVue mono repository, installed from npm at pinned versions
(see [NiiVue versions](#niivue-versions)).

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
| `apps/brainsonify/src/layout.ts` | Row, grid or column for the four tiles, from the stage's aspect ratio; the render is always one of them |
| `apps/brainsonify/src/ui.ts` | Control panel and live readout |
| `apps/brainsonify/src/soundkey.ts` | Plays the key: says each label, then drives the voice through its sweep |
| `apps/brainsonify/src/atlas.ts` | The AAL atlas: world position to region name, spoken on entry; each region's centroid and nearest voxel |
| `apps/brainsonify/src/region-names.ts` | The spoken name of every AAL region in anatomical English, `left inferior frontal gyrus, triangular part`; a label not in the table gets a name generated from its parts |
| `libs/control/src/schema.ts` | The panel's parameters: range, step, default and spoken name for each |
| `libs/control/src/controller.ts` | `ControlAPI`: a validated state store with change events and undo |
| `libs/control/src/surface.ts` | `ControlSurface`: the Helm, its modes and step sizes, and what it says |
| `apps/brainsonify/src/controllers/keys.ts` | The key protocol: which key sends which intent to the surface |
| `apps/brainsonify/src/controllers/virtual.ts` | The virtual controller: a keyboard driving the surface |
| `apps/brainsonify/src/controllers/onscreen.ts` | The virtual Helm: the dial and the technician's buttons in a draggable window, driving the surface with the mouse or a touchscreen |
| `apps/brainsonify/src/tutorial.ts` | The Helm tutorial: every control in turn, spoken to the listener and shown to the technician |
| `@niivue/nv-mcp` (mono `packages/nv-mcp`) | The NiiVue MCP core: the tab bridge and the core tools on the server, the page's socket and the handlers that answer them from a NiiVue instance |
| `apps/brainsonify/src/controllers/agent.ts` | What brainsonify adds: the sound tools' handlers, wrapped as a controller |
| `apps/mcp/src/brainsonify.ts` | The brainsonify extension: `set_sound`, `list_modes`, `set_mode`, `announce` registered on the core |
| `apps/mcp/src/server.ts` | The MCP server: the core plus that extension, over streamable HTTP |
| `apps/brainsonify/src/panel.spec.ts` | Guards that the schema and the panel in `index.html` agree |
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
?experiment=08-regions   + the AAL region under the pointer is spoken
?experiment=09-coronal   + opens already cut to the medial coronal plane
?experiment=10-sweep     + a radar sweep reads the cut face on its own
?experiment=11-fast-lines  the same sweep, each line a half-second gesture   (default)
```

Switching does not reload: a volume you dropped in survives the change, which is
the point when you are comparing two mappings of the same scan. Controls and
readout rows belonging to a channel the condition does not use are hidden rather
than left dead, and the change is announced for a listener who cannot see it.

[EXPERIMENTS.md](EXPERIMENTS.md) is the log — what each condition maps, what to
listen for, and what it showed. `apps/brainsonify/src/experiments.ts` is the
registry that drives the switcher, the default, and the visible controls.

## How it works

- **Pointer to canvas.** `clientToCanvas` turns the pointer's page position
  into the canvas pixels NiiVue's picking works in, and `hitTest` says which
  tile that is. The canvas is looked up through `nv.canvas` each time rather
  than kept: where WebGPU is missing NiiVue falls back to WebGL2 by cloning
  the canvas and swapping the clone in, which leaves a kept reference
  detached. Pointer listeners are on the stage the canvas fills, for the same
  reason.
- **2D slices.** `canvasToMM` gives the world position under the pointer, the
  volume's `matRAS` turns it into a voxel, and `voxelValue` in `geometry.ts`
  reads the intensity (clamped to the grid, with `scl_slope`/`scl_inter`
  applied, as NiiVue 0.x's `getValue` did; 1.0 has no public equivalent). The
  crosshair is not moved.
- **3D render.** Over the render tile the app calls the view's `depthPick`,
  the same call NiiVue's own double-click makes, which runs a dedicated pick
  pass and resolves to a world position, or null on a miss. The scene is
  redrawn after it, since the pass renders into the canvas. Throttled to one
  pick per animation frame.
- **Why the render needs a surface search.** The picking shader marches in steps
  of ~1.9 voxels until a sample's colormap alpha reaches 0.01, then steps back
  and refines one step at a time. The point it hands back is therefore the
  faint outer rim where tissue merely becomes *visible* — hover a bright gyral
  crown and you can easily read the air in front of it. `Surface` searches that many voxels along the view
  ray and keeps the strongest value. The ray is the one through that pixel,
  unprojected through the render tile's own camera (`getScreenTiles()` hands
  out each tile's MVP), and turned into a one-voxel step through `matRAS`. The search is one-dimensional on purpose:
  widening it into a box would blur across the sulci, which are the features this
  whole thing exists to make audible. 2D tiles never do this — they are an exact
  single-voxel read.
- **Clipping to get inside.** On a whole-head scan the scalp and skull wrap
  everything, so the depth picker can only ever land on the outside — the render
  is a face, not a brain. `Clip` cuts the near side away, and because the picking
  shader honors clip planes (`clipSampleRange` skips clipped samples) the pick
  then lands on whatever the cut exposes. The plane's normal is the camera's own
  angles flipped, so the opening faces the viewer and keeps facing them through a
  rotation instead of swinging round to the far side. A ray that finds nothing
  visible past the cut does not miss: NiiVue falls back to the point where it
  meets the plane, so hovering the opened cavity sounds the voxel on the plane
  there, usually background that the gate silences.
- **The radar sweep.** Where a condition offers it, **Start radar sweep** reads
  the cut face without a pointer: left to right along one line, then the next
  line down, wrapping from the bottom back to the top until stopped. `sweep.ts`
  takes NiiVue's own clip plane (`model.clipPlanes`) — `[nx, ny, nz, depth]`, the plane
  `dot(n, p − 0.5) + depth = 0` in fraction space, which is what its render
  shader clips against — and builds a frame on it: the in-plane direction
  closest to inferior is "down", and "across" is perpendicular to that, signed
  towards anatomical right (or, on a sagittal cut, towards the front). An axial
  cut has no inferior direction in it, so there posterior is "down" and the
  front is at the top. With no clip plane set the sweep reads the coronal plane
  through the crosshair. The face is re-read every frame, so the wheel and `c`
  move the sweep along with the plane. Each point goes through the same
  `sampleFraction` a crosshair step uses and through the same `onSample` a
  hover does, so every channel, the bone spike's reach included, is in play.
  The crosshair follows, and the magenta scan line is drawn only as far as the
  sweep has got along the current line. Hovering is ignored while it runs. The
  pace comes off three sliders, read every frame: seconds per line, lines to a
  face, and a rest between lines, during which the sweep is silent the way a
  pointer off the canvas is. `Lines run` picks which of the four cardinal
  directions a line is read in. Rows always step from the top of the face
  down and columns always from the left edge across, so between two
  settings only the way a line reads changes, not the order the face is
  covered in. Cardinal directions and not an angle, so every line still
  spans the whole face and the first and last lines still lie on its edges.
  The scan line is drawn from where the current line began to where the
  sweep has got, whichever way it runs. Each sweep condition sets these on
  entry.
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
  projected through each tile's own camera: a 2D tile's is orthographic, so a
  point off the shown slice lands on the tile as its shadow on the tile's
  plane, which is what a probe that by design reaches past the slice you are
  looking at needs. The lines are drawn on a transparent canvas stacked over
  NiiVue's, a frame after each NiiVue frame the app asks for or NiiVue
  announces (a camera turn, a resize, a cut), so they stay on the picture
  through a drag to rotate. NiiVue 1.0 has no line call, and its overlay hook
  runs only on WebGPU.
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
- **The Sonaview Helm.** The app is built for two people at once: a listener who turns
  one hand-held device, the Sonaview Helm (the Helm for short), and hears the result, and a technician who presses buttons that
  change what turning does. `ControlSurface` in `libs/control` is that
  arrangement with nothing physical in it. A turn moves the crosshair along
  one axis, slides the cut plane along its own axis (the wheel's move over
  the render), or nudges the focused panel parameter. The buttons pick the
  mode, the step size (fine, medium, large: 1, 5 and 10 percent of the volume
  for the crosshair and the plane, 1, 5 and 10 schema steps for a parameter),
  the focused parameter in the panel's order, center the crosshair, or jump to
  the next whole plane in the same cycle as `c`, read back from the scene so
  the two stay in step; either one also turns the render camera to face the
  new cut, since the face is only on the near side from there. Pressing the Helm never changes anything: it says
  where the crosshair is, region first when the atlas fits, or what the
  focused parameter reads. A shared device needs one gesture the listener can
  make freely, and that is it. Every button press is announced into the
  crosshair live region and, while sound is on, out loud, since a listener
  otherwise has no way to know the Helm now does something else; numeric
  nudges are silent, because the sound is the feedback. NiiVue's own keys
  over the canvas are announced the same way: `v` says the view it changed
  to, and `c` names the plane it cut, as the Helm does. So does the Clip
  slider, but only when it turns the cut on or off, not while it is dragged.
  The virtual controller
  is a keyboard: `controllers/keys.ts` is the whole protocol, chosen around the
  keys NiiVue already reads while the pointer is over the canvas, and a physical rotary panel
  presenting itself as a Bluetooth keyboard sends the same keys
  ([docs/control/CROWPANEL.md](docs/control/CROWPANEL.md)). The panel and the
  control API hold the same values and each follows the other: a slider
  reaches the API through the panel's change listener, the Helm reaches the
  sliders through the API's, and a value already held is not written again,
  so neither direction loops. `panel.spec.ts` checks the schema against
  `index.html` so the two cannot drift. The Helm's step size is separate from
  the step select beside the crosshair buttons: that select belongs to the
  buttons, the Helm's belongs to the Helm.
- **The Helm tutorial.** The panel's **Helm tutorial** button walks the
  listener and the technician through every Helm control, one per step, in
  `TUTORIAL_STEPS` (`src/tutorial.ts`); a spec checks the steps cover every
  intent in `controllers/keys.ts` once. Each step is said to the listener and
  shown on the panel with the key the technician presses. A step ends when it
  is done, not on a Next button: the press or turn it teaches, or for a mode,
  the mode key and then a turn. The keys behave as always; the tutorial only
  watches the intents the virtual controller reports after carrying them
  out. Speaking a line cancels the one before, so while the tutorial runs the
  surface's announcements are held and said in the same utterance as the
  next prompt, and anything no step claims is said on its own straight
  after. It needs sound on, since announcements are silent without it, stops
  the sound key so the two do not talk over each other, and starts from
  left/right mode.
- **The virtual Helm.** The panel's **Virtual Helm** button opens the Helm
  on screen, in a window that floats over the render and drags by its title
  bar: a dial the listener turns and presses, and a button for each of the
  technician's keys, each showing its key. It is for anyone with a mouse or
  a touchscreen and no device or key map. Dragging round the dial sends one
  turn per 15 degrees (`DETENT_DEGREES`), a wheel notch over it sends one, and
  the hub presses; the tick on the dial is only for the eye, since the step
  size still comes from `s`. The buttons are generated from `KEY_MAP`, so a
  change to the table changes the window, and the current mode's button is
  lit. Every gesture goes through `perform`, as a key does, and is reported
  to the tutorial the same way, so the window keeps no mode or step of its
  own; its status line is the panel's Helm line. A tap never leaves the
  focus on one of its buttons, so the keyboard keeps working beside it. The
  window sits on the body, outside the stage, so the pointer over it is not
  sampled as the canvas beneath. Its position and whether it is open are
  kept in `localStorage`, and it opens on load with `?helm=1` in the
  address.

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
| Helm tutorial | Walks the listener and technician through every Helm control, spoken step by step; stops the sound key, needs sound on |
| Virtual Helm | Shows or hides the Helm on screen: a dial to drag round, scroll or press, and the technician's buttons; `?helm=1` opens it on load |
| Glide | Smoothing time on frequency changes |
| Sonify the 3D render | Enables depth picking on the render tile |
| Start radar sweep | Reads the cut face on its own, left to right and top to bottom, looping; shown only by a condition that offers it |
| Line / Lines / Rest | The sweep's pace: seconds per line, lines to a face, and the silence between lines, up to 3 s; each sweep condition sets its own on entry |
| Lines run | Which cardinal direction each line is read in: left to right, right to left, top to bottom, bottom to top; rows always step top down and columns left to right |
| Helm | `↑` `↓` turn, `Enter` press and hear where you are; `1`–`5` pick what a turn moves (left/right, back/front, down/up, cut plane, parameter), `0` the next mode; `[` `]` the parameter, `s` the step size, `Home` centers, `n` the next whole plane. Works anywhere on the page outside a form control |

Drop a `.nii` / `.nii.gz` anywhere on the page to load your own volume. Two
demo volumes are fetched from `niivue.github.io` at runtime and are not stored
in this repo: MNI152, which is skull-stripped, and a whole-head T1 that keeps
scalp, marrow and the skull's signal void — the wider opacity range the rhythm
channel is meant to carry, and the only one of the two with a skull for the bone
channel to find.

## Agents

An agent reaches the app through an [MCP](https://modelcontextprotocol.io)
server, so it can take a listener to a named structure without a hand on the
panel. `bun run mcp` starts one Bun process on the loopback address, port
4242, serving two things: `/mcp`, the streamable HTTP endpoint an agent's
client connects to, and `/app`, a WebSocket the browser keeps open. The
server holds no anatomy of its own. Each tool call is written to the
connected tab as one JSON request and answered with one JSON response, and
with no tab connected the tool fails with a message saying what to open.

The server is the generic NiiVue core, mono's `@niivue/nv-mcp`, with
brainsonify's sound tools registered on it; its own README in mono's
`packages/nv-mcp` covers the tools, the tab routing and how to embed it in
another NiiVue app, and
[apps/mcp/README.md](apps/mcp/README.md) covers what brainsonify adds.

Each tab says hello with an id it keeps in `sessionStorage`, so a reload
comes back as the same tab and a second window as a new one. One tab
answers on its own; with several open the agent is told to pick one with
`use_tab`, or names one with `tab` on the call, and `where_am_i` says
which tab answered. An agent that wants a tab of its own asks `new_tab`
for an address with `?tab=<id>` on it, and a page opened from it answers
to that id for the rest of the conversation. When the tab an agent
is driving reloads, the next reply opens with a note saying so and what
the crosshair, plane and sound were before, since the scene has started
over. The line under the crosshair buttons shows the tab's id next to
"agent server connected".

The app opens the socket in development always, and otherwise when `?agent`
is in the address (`?agent=ws://host:port/app` names a server elsewhere).
Left to itself it tries two addresses in turn: `/agent` on the page's own
origin first, which the dev server proxies to the server's `/app` (see
`server.proxy` in `vite.config.ts`), so a browser that lets a page reach one
origin only, such as the pane inside Claude's desktop app, still gets
through; then the server directly on port 4242, for a build served without
the proxy. A page opened from a file has no origin and goes direct. A line
under the crosshair buttons says whether the server was reached, and the
socket is retried with a backoff that settles at half a minute, so the order
the two are started in does not matter. The console gets one line when the
server is reached and one when the retry settles without it; the browser's
own line per refused attempt is not the app's.

Eighteen tools. From the core: `list_tabs`, `use_tab`, `new_tab`, `load_volume`,
`add_overlay`, `where_am_i`, `list_regions`, `go_to_region`, `go_to_point`,
`set_clip_plane`, `set_camera`, `set_volume`, `set_view` and `screenshot`. From brainsonify:
`set_sound`, `list_modes`, `set_mode` and `announce`. The three a
technician leans on:

| Tool | What it does |
|---|---|
| `list_regions` | Every AAL region with its label, spoken name, centroid in MNI millimetres and voxel count; `query` filters by label or name |
| `go_to_region` | Moves the crosshair to a region's centroid, cuts the volume with a plane through that point, sounds the voxel there and announces the place; `plane` is one of the six sides (`left`, `right`, `posterior`, `anterior`, `inferior`, `superior`), a slice name (`coronal`, `sagittal`, `axial`), or `current` |
| `where_am_i` | The crosshair in millimetres and fractions, the region there, which plane is cut, whether sound is on, and what the listener would hear |

Going to a region is what a technician would do by hand, in one move. The
region is matched by label or spoken name, exactly first and then by
containment, case and underscores aside; the name generated from the label
(`Left frontal inferior triangular`), which the tools used before the
table, is kept as an alias so it still matches. Its centroid is the mean of its
voxels in the atlas grid, taken once per session and turned to millimetres
through the atlas's own affine; when that mean falls outside the region, as a
curved one's can, the region's nearest voxel is used instead and the reply
says `snapped`. The crosshair goes to that point through NiiVue's `mm2scene`.
The cut keeps the orientation already on screen when one is cut and falls
back to coronal when none is, so a first visit gets a face to land on and a
later one keeps the technician's choice. Its depth is the one that puts the
plane through the landing point: NiiVue keeps a clip plane as
`dot(normal, p − 0.5) + depth = 0` in fraction space, with the normal derived
from the azimuth turned half a turn, so the depth is the negative of the
point's signed distance from the middle along that normal. The render camera
is turned to face the cut before it is made: NiiVue's shader keeps the side
the plane's normal points to, so the exposed face looks back along the
normal, and the camera that sees it square on is the one whose view
direction *is* the normal. Worked through NiiVue's model matrix
(`cameraForPlane`, checked against `viewDirection` in the tests) that is the
plane's own elevation and its azimuth turned the other way, so a cut from
the right, azimuth 90, is faced from azimuth 270. Without the turn the
default left-lateral camera sees the intact left side and the face with the
region on it is round the back, and a depth pick over the render lands on
scalp rather than on the face. The turn comes first because it fires
`azimuthElevationChange`, and the cut that follows overrides whatever the
Clip slider made of that. The reply carries the camera angles as well as
the plane's. The voxel under
the crosshair is then sampled the way a crosshair button samples it, and the
place is announced through the same path as the Helm: into the live region,
and out loud while sound is on. Navigation needs the loaded scan to be in
MNI space; on the whole-head T1 the tool declines rather than name regions
that are not there. The **Clip** slider still ties the plane to the camera
when it is above zero, so a camera turn after a navigation re-cuts the plane
the slider's way.

A region name that fits more than one region, `insula` say, is refused with
the candidates listed rather than guessed at.

An agent that speaks MCP over HTTP attaches with the endpoint address; for
Claude Code that is
`claude mcp add --transport http brainsonify http://127.0.0.1:4242/mcp`.
The Claude desktop app only takes a custom connector over HTTPS, so it
reaches the server through the `mcp-remote` bridge instead, as a local
server in `claude_desktop_config.json`:

```json
"mcpServers": {
  "brainsonify": {
    "command": "/opt/homebrew/bin/npx",
    "args": ["-y", "mcp-remote", "http://127.0.0.1:4242/mcp"]
  }
}
```

The full path to `npx` matters: the app is launched without a shell, so it
does not have Homebrew on its `PATH`.

## Hardware

The knob in the Controls table can also be a physical one: an Elecrow CrowPanel
2.1" rotary display that appears to the browser as a USB mouse and keyboard. A
handheld built around it, with a Raspberry Pi Zero 2 W, a LiPo, and an Enviro
pHAT, is described in [docs/hardware](docs/hardware/README.md), with renders of
the case and a wiring diagram.

## Deployment

Pushes to `main` build the app and publish `dist/apps/brainsonify` to GitHub
Pages via `.github/workflows/deploy.yml`. Vite is configured with `base: "./"`,
so the bundle works from any subpath without hardcoding the repo name.

## Status

Spike. The mapping is unvalidated — no condition in [EXPERIMENTS.md](EXPERIMENTS.md)
has been run with listeners yet. An agent can now take the listener to a named
structure over MCP; the listener still has no way to ask for one themselves,
which is the harder and more interesting problem.

## Credits

NiiVue is developed by the NiiVue contributors and distributed under the
BSD-2-Clause license.
