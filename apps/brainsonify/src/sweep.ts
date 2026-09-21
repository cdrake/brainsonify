/**
 * The geometry of the radar sweep: where the cut face is, and where on it a
 * given moment of the sweep lands.
 *
 * Pure math over NiiVue's own numbers, kept out of `main.ts` so it can be
 * tested without a canvas. Everything here is in NiiVue's fraction space --
 * the 0..1 texture coordinates `frac2mm` and `sampleFraction` already speak
 * -- because that is the space the clip plane itself lives in.
 */

export type Vec3 = [number, number, number];

/**
 * The cut face as a frame: `origin` is the point on the face nearest the
 * centre of the volume, `across` is one full line of the sweep from left to
 * right, and `down` is one full face from the top line to the bottom one.
 * Both are unit vectors, so a face spans one texture unit either way -- the
 * whole face for any of NiiVue's six axis-aligned presets, the middle of it
 * for a plane that is tilted.
 */
export interface Face {
  origin: Vec3;
  across: Vec3;
  down: Vec3;
}

/** NiiVue treats a clip depth past 1 as no plane at all. */
const NO_PLANE = 1;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : a;
}

/** The part of `a` that lies in the plane whose normal is `n`. */
function reject(a: Vec3, n: Vec3): Vec3 {
  const along = dot(a, n);
  return [a[0] - n[0] * along, a[1] - n[1] * along, a[2] - n[2] * along];
}

/**
 * Signs a vector so its largest component is positive: "left to right" is
 * towards anatomical right where the line has any left-right in it, and
 * towards the front on a sagittal cut where it has none.
 */
function towardsPositive(a: Vec3): Vec3 {
  const largest = [0, 1, 2].reduce((best, i) => (Math.abs(a[i]) > Math.abs(a[best]) ? i : best), 0);
  return a[largest] < 0 ? scale(a, -1) : a;
}

/**
 * The face the sweep reads, from NiiVue's `scene.clipPlane` (`[nx, ny, nz,
 * depth]`, the plane `dot(n, p - 0.5) + depth = 0` in fraction space, which
 * is what its render shader clips against) and the crosshair position.
 *
 * With no clip plane set, the sweep reads the coronal plane through the
 * crosshair instead: the same plane 09 opens cut to, wherever the crosshair
 * has been left, so the button does something sensible in a condition that
 * opens whole.
 *
 * "Down" is the direction in the face closest to inferior. An axial cut has
 * no such direction, so there posterior stands in: anterior at the top, the
 * way an axial slice is usually shown.
 */
export function cutFace(clipPlane: ArrayLike<number>, crosshair: ArrayLike<number>): Face {
  let normal: Vec3;
  let depth: number;
  if (clipPlane.length >= 4 && clipPlane[3] <= NO_PLANE && length([clipPlane[0], clipPlane[1], clipPlane[2]]) > 0) {
    normal = normalize([clipPlane[0], clipPlane[1], clipPlane[2]]);
    depth = clipPlane[3];
  } else {
    normal = [0, 1, 0];
    depth = 0.5 - crosshair[1];
  }

  const origin: Vec3 = [0.5 - normal[0] * depth, 0.5 - normal[1] * depth, 0.5 - normal[2] * depth];

  let down = reject([0, 0, -1], normal);
  if (length(down) < 1e-6) down = reject([0, -1, 0], normal);
  down = normalize(down);

  const across = towardsPositive(normalize(cross(normal, down)));
  return { origin, across, down };
}

/**
 * Where on the face the sweep is, for `across` 0..1 along the current line
 * (left to right) and `line` 0..1 through the face (top to bottom). Either
 * can land outside the volume on a tilted plane; the sampler answers null
 * there and the sweep carries on.
 */
export function facePoint(face: Face, across: number, line: number): Vec3 {
  const a = across - 0.5;
  const d = line - 0.5;
  return [
    face.origin[0] + face.across[0] * a + face.down[0] * d,
    face.origin[1] + face.across[1] * a + face.down[1] * d,
    face.origin[2] + face.across[2] * a + face.down[2] * d,
  ];
}

/** Where the sweep is: a fraction along the current line, and which line. */
export interface Raster {
  across: number;
  line: number;
}

/**
 * Moves the sweep on by `dt` seconds: along the line at one line per
 * `lineSeconds`, and on to the next line down, `lineStep` of the face
 * further, when the current one runs off the right edge. The bottom line
 * wraps back to the top, so the sweep loops until stopped. Returns the new
 * position rather than mutating, so a frame that is dropped changes nothing.
 */
export function advance(raster: Raster, dt: number, lineSeconds: number, lineStep: number): Raster {
  let across = raster.across + dt / lineSeconds;
  let line = raster.line;
  while (across >= 1) {
    across -= 1;
    line += lineStep;
    // The last line is the one at the very bottom; a step past it starts over.
    if (line > 1 + 1e-9) line = 0;
  }
  return { across, line };
}
