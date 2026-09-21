/**
 * The experiment log, in the order the experiments were run.
 *
 * Each entry is one condition of the study: a named set of sensory channels the
 * app maps the volume onto. They share a single build rather than living on
 * separate branches, so a listener can move between conditions without a reload
 * and a fix to the sampler benefits every condition instead of leaving the
 * earlier ones to rot.
 *
 * Adding an experiment means appending an entry here. The last one is what a
 * visitor gets by default.
 */

import { BONE_TAPS, DEFAULT_TAPS, type Mode, type TapRange } from "@brainsonify/sonification";

import type { SweepPace } from "./sweep";

/**
 * Which mappings a condition turns on. A channel that is off is not merely
 * quiet: its controls and its readout row are hidden, so the panel only ever
 * shows what the condition being tested actually uses.
 */
export interface Channels {
  /** Stereo position from anatomical left-right (world X). */
  stereo: boolean;
  /** Tap rate from the opacity the colormap gives the voxel. */
  rhythm: boolean;
  /**
   * Tap rate from how bone-like the voxel is, instead of from opacity.
   *
   * Mutually exclusive with `rhythm` in practice: they drive the same tap
   * layer, and the point of the condition is which signal is behind it.
   */
  bone: boolean;
  /**
   * Front-back position from world Y, carried as the brightness of the tap.
   *
   * Rides whichever signal is already driving the taps rather than replacing
   * it: the rate still says what the tissue is, and the color says where it
   * is. Needs a tap layer to ride, so it is only meaningful alongside `rhythm`
   * or `bone`.
   */
  depth: boolean;
  /** Inferior-superior position from world Z, carried by loudness. */
  height: boolean;
  /**
   * The name of the atlas region under the pointer, spoken on entry.
   *
   * Not a sound but a word, over whatever the other channels are doing. The
   * atlas is in MNI space, so this only means anything on a scan that is too.
   */
  atlas: boolean;
}

export interface Experiment {
  /** URL slug, as `?experiment=<id>`. Stable: links to it get shared. */
  id: string;
  /** Ordinal, shown in the switcher. */
  number: string;
  /** Short name, for the switcher and the spoken announcement. */
  name: string;
  /** What this condition adds over the one before it. */
  summary: string;
  /** Commit this condition was last its own HEAD at, for provenance. */
  commit: string;
  channels: Channels;
  /**
   * Which continuous-voice mode this condition opens with, if it needs one
   * other than the default. A visitor can still switch the `Mapping` control
   * themselves; this only sets where it starts.
   */
  mode?: Mode;
  /**
   * The tap rates this condition spends, if it taps at all.
   *
   * A condition owns its own mapping: 03 and 04 drive the same layer from
   * different signals, and a signal that marks a boundary wants a wider, faster
   * range than one that reports a quantity. Entering a condition resets the
   * `Taps` ceiling to this, since carrying the previous condition's ceiling
   * across would silently change what is being compared.
   */
  taps?: TapRange;
  /**
   * `[depth, azimuth, elevation]` for NiiVue's own built-in clip plane, if
   * this condition wants to open already cut rather than whole. Not a
   * channel -- it changes what is in reach of the pointer, not what a voxel
   * sounds like -- so it lives here next to `mode`/`taps` instead of in
   * `Channels`. A visitor can still move the plane themselves afterwards,
   * same as any other condition: the mouse wheel over the 3D render nudges
   * its depth, and `c` cycles NiiVue's own anatomical presets. This only
   * sets where it starts.
   */
  clip?: [number, number, number];
  /**
   * The radar sweep this condition offers, if any: a button that reads the
   * cut face on its own, one line at a time from left to right and top to
   * bottom, looping, with the pointer ignored while it runs. Like `clip`,
   * not a channel -- it changes who is doing the moving, not what a voxel
   * sounds like. The sweep reads whatever plane NiiVue is currently cut on,
   * so it follows the wheel and `c` like everything else. The pace is the
   * condition's own, the way `taps` is: entering it resets the sweep
   * sliders, since the pace is the thing the sweep conditions differ in.
   */
  sweep?: SweepPace;
}

/**
 * The pace 10 was first heard at: a slow walk, one line every four seconds,
 * twenty-one lines to a face, no gap between them. Named so 11 can say
 * exactly what it changed.
 */
export const SLOW_SWEEP: SweepPace = { lineSeconds: 4, lines: 21, restSeconds: 0, direction: "right" };

/**
 * A line as a gesture: half a second across, then a short silence, so each
 * line is heard as one short run rather than a walk, and a face takes
 * seconds instead of over a minute. Same twenty-one lines as `SLOW_SWEEP`,
 * so the only thing that changes between 10 and 11 is the pace.
 */
export const FAST_SWEEP: SweepPace = { lineSeconds: 0.5, lines: 21, restSeconds: 0.3, direction: "right" };

/**
 * The medial slice of the coronal plane: depth 0 is the midline itself, and
 * azimuth 0 / elevation 0 is NiiVue's own POSTERIOR preset (see
 * CLIP_PLANE_PRESETS in its KeyboardController) -- the same plane a visitor
 * lands on by pressing `c` once by hand. Named here, rather than inline on
 * the experiment below, so a future condition that wants the same starting
 * cut is not stuck re-deriving it.
 */
export const CORONAL_MEDIAL: [number, number, number] = [0, 0, 0];

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: "01-pitch",
    number: "01",
    name: "Pitch only",
    summary:
      "Pitch tracks voxel intensity. A single mono voice, with no cue for where in the volume it came from.",
    commit: "55390a3",
    channels: { stereo: false, rhythm: false, bone: false, depth: false, height: false, atlas: false },
  },
  {
    id: "02-stereo",
    number: "02",
    name: "Stereo",
    summary:
      "Pitch tracks intensity and the stereo image carries anatomical left-right, so the left hemisphere sounds in your left ear.",
    commit: "9caa560",
    channels: { stereo: true, rhythm: false, bone: false, depth: false, height: false, atlas: false },
  },
  {
    id: "03-rhythm",
    number: "03",
    name: "Rhythm",
    summary:
      "Adds a tap whose rate follows opacity, so dense tissue rattles and near-transparent tissue ticks.",
    commit: "a7fc509",
    channels: { stereo: true, rhythm: true, bone: false, depth: false, height: false, atlas: false },
    taps: DEFAULT_TAPS,
  },
  {
    id: "04-bone",
    number: "04",
    name: "Bone rhythm",
    summary:
      "The tap rate follows how bone-like the tissue is rather than how opaque, so the skull flutters where a T1 renders it as a void and soft tissue barely ticks.",
    commit: "672eb3b",
    channels: { stereo: true, rhythm: false, bone: true, depth: false, height: false, atlas: false },
    taps: BONE_TAPS,
  },
  {
    id: "05-depth",
    number: "05",
    name: "Depth",
    summary:
      "Keeps the bone rhythm and gives the tap a front-back position too: an anterior tap is bright and clicky, a posterior one dull, so one strike carries both what the tissue is and where it sits.",
    commit: "672eb3b",
    channels: { stereo: true, rhythm: false, bone: true, depth: true, height: false, atlas: false },
    taps: BONE_TAPS,
  },
  {
    id: "06-height",
    number: "06",
    name: "Height",
    summary:
      "Adds a loudness window for anatomical inferior-superior position: lower voxels are quieter and higher voxels louder.",
    commit: "ec159e5",
    channels: { stereo: true, rhythm: false, bone: true, depth: true, height: true, atlas: false },
    taps: BONE_TAPS,
  },
  {
    id: "07-texture",
    number: "07",
    name: "Texture",
    summary:
      "Replaces the pitched voice with unpitched white noise: brightness carries intensity instead of pitch, so there is no tonal center for the bone rhythm to compete with, and the taps can read as a foreground event against a flat bed rather than a texture riding on top of a moving tone.",
    commit: "ec159e5",
    channels: { stereo: true, rhythm: false, bone: true, depth: true, height: true, atlas: false },
    taps: BONE_TAPS,
    mode: "texture",
  },
  {
    id: "08-regions",
    number: "08",
    name: "Regions",
    summary:
      "Keeps the texture and bone rhythm of 07 and names the anatomy: entering a region of the AAL atlas is called out in speech, so a listener gets a label as well as a position.",
    commit: "ec159e5",
    channels: { stereo: true, rhythm: false, bone: true, depth: true, height: true, atlas: true },
    taps: BONE_TAPS,
    mode: "texture",
  },
  {
    id: "09-coronal",
    number: "09",
    name: "Coronal cut",
    summary:
      "Keeps everything 08 maps, and opens already cut to the medial slice of the coronal plane instead of whole: a fixed anatomical starting point for a sighted technician to guide a listener from, moving the cut with NiiVue's own mouse wheel and `c` presets rather than free 3D hovering alone.",
    commit: "206792f",
    channels: { stereo: true, rhythm: false, bone: true, depth: true, height: true, atlas: true },
    taps: BONE_TAPS,
    mode: "texture",
    clip: CORONAL_MEDIAL,
  },
  {
    id: "10-sweep",
    number: "10",
    name: "Radar sweep",
    summary:
      "Keeps 09's coronal cut and everything it maps, and adds a sweep that reads the cut face on its own: left to right along one line, then the next line down, looping, with the bone spike's reach in play the whole way -- so a listener can sit back and take in a whole plane instead of hunting for it with the pointer.",
    commit: "206792f",
    channels: { stereo: true, rhythm: false, bone: true, depth: true, height: true, atlas: true },
    taps: BONE_TAPS,
    mode: "texture",
    clip: CORONAL_MEDIAL,
    sweep: SLOW_SWEEP,
  },
  {
    id: "11-fast-lines",
    number: "11",
    name: "Fast lines",
    summary:
      "The same sweep as 10, at a different pace: each line of the face is a half-second run with a short silence after it, so a line is heard as one gesture with the bone taps inside it, and a whole face goes by in seconds instead of over a minute.",
    commit: "working",
    channels: { stereo: true, rhythm: false, bone: true, depth: true, height: true, atlas: true },
    taps: BONE_TAPS,
    mode: "texture",
    clip: CORONAL_MEDIAL,
    sweep: FAST_SWEEP,
  },
];

/** What a visitor with no experiment in the URL gets: the most recent one. */
export const LATEST: Experiment = EXPERIMENTS[EXPERIMENTS.length - 1];

/** The query parameter that selects a condition. */
export const PARAM = "experiment";

/**
 * Resolves `?experiment=<id>` against the log.
 *
 * An unknown id falls back to the latest rather than failing: a link handed to
 * a participant should land somewhere usable even if it outlives its condition.
 */
export function resolveExperiment(search: string): Experiment {
  const id = new URLSearchParams(search).get(PARAM);
  return EXPERIMENTS.find((experiment) => experiment.id === id) ?? LATEST;
}

/**
 * The link for a condition. Relative, so it survives being served from a
 * GitHub Pages subpath, and always explicit rather than leaning on the bare
 * root, so a link stays pinned to its condition once a later one is appended.
 */
export function experimentHref(experiment: Experiment): string {
  return `./?${PARAM}=${experiment.id}`;
}
