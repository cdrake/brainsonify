import { NVImage } from "@niivue/niivue";

import type { RegionSummary } from "@brainsonify/control";

import { SPOKEN_NAMES } from "./region-names";
import type { Speech } from "./soundkey";

/**
 * Names the region under the pointer.
 *
 * The atlas is a labelled volume in MNI space, so a voxel of the loaded scan
 * is looked up by its world position rather than its index: the two grids do
 * not match, and need not. A region is called out in speech when the pointer
 * enters it, over whatever the condition is already sounding, and shown in
 * the readout for anyone reading rather than listening.
 */

/**
 * Where the atlas comes from: NiiVue's own copy of AAL, fetched at runtime
 * the way the demo volumes are, and not stored in the repo.
 */
export const ATLAS = {
  name: "AAL",
  volume: "https://niivue.com/demos/images/aal.nii.gz",
  labels: "https://niivue.com/demos/images/aal.json",
} as const;

/**
 * How long the pointer must rest in a region before its name is spoken.
 *
 * A sweep across the cortex crosses a region every few voxels, and speaking
 * each one would give fragments of names cut off by the next. Waiting this
 * long turns a sweep into silence and a pause into a name. Chosen, not
 * measured.
 */
export const DWELL_MS = 150;

/** One region of the atlas, with the label value that marks its voxels. */
export interface Region extends RegionSummary {
  value: number;
  /** Other names the region answers to: the generated one, where the table's differs. */
  aliases: readonly string[];
}

/** Looks a world position up in the atlas. */
export interface Atlas {
  /** The spoken name of the region at `mm`, or null where nothing is labelled. */
  regionAt(mm: readonly number[]): string | null;
  /** The label value at `mm`, or 0 outside the atlas and wherever nothing is labelled. */
  valueAt(mm: readonly number[]): number;
  /** Every region that has at least one voxel, in the label table's order. */
  regions(): readonly Region[];
  /**
   * The world position of the region's voxel closest to `mm`, or null when
   * no voxel carries the value. For a region whose centroid falls outside
   * itself, this is where an agent lands instead.
   */
  nearestIn(value: number, mm: readonly number[]): [number, number, number] | null;
}

/** Where a label's voxels sit in the grid, before any of it is in millimetres. */
export interface LabelStats {
  value: number;
  voxels: number;
  /** The mean voxel index along each axis. */
  centroid: [number, number, number];
}

/**
 * Counts every label's voxels and averages where they are, in one pass.
 *
 * `img` is the volume laid out as NiiVue keeps it, x fastest and z slowest,
 * so the voxel at `(x, y, z)` is `img[x + y * nx + z * nx * ny]`. Zero is
 * background and is not counted. Labels are reported in ascending order.
 */
export function labelStats(
  img: ArrayLike<number>,
  dims: readonly [number, number, number],
): LabelStats[] {
  const [nx, ny, nz] = dims;
  const count = new Map<number, number>();
  const sum = new Map<number, [number, number, number]>();
  let i = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++, i++) {
        const value = img[i];
        if (!(value > 0)) continue;
        const total = sum.get(value);
        if (total) {
          total[0] += x;
          total[1] += y;
          total[2] += z;
          count.set(value, (count.get(value) ?? 0) + 1);
        } else {
          sum.set(value, [x, y, z]);
          count.set(value, 1);
        }
      }
    }
  }
  return [...count.keys()]
    .sort((a, b) => a - b)
    .map((value) => {
      const n = count.get(value) ?? 1;
      const total = sum.get(value) ?? [0, 0, 0];
      return { value, voxels: n, centroid: [total[0] / n, total[1] / n, total[2] / n] };
    });
}

/**
 * The voxel carrying `value` nearest to `from`, in voxel indices, or null
 * when none does. A full scan, since a region can be any shape: it is only
 * asked for when a centroid has missed, which a navigation can afford.
 */
export function nearestVoxel(
  img: ArrayLike<number>,
  dims: readonly [number, number, number],
  value: number,
  from: readonly number[],
): [number, number, number] | null {
  const [nx, ny, nz] = dims;
  let best: [number, number, number] | null = null;
  let bestDistance = Infinity;
  let i = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++, i++) {
        if (img[i] !== value) continue;
        const distance = (x - from[0]) ** 2 + (y - from[1]) ** 2 + (z - from[2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [x, y, z];
        }
      }
    }
  }
  return best;
}

/**
 * The AAL abbreviations, spelled out for speech.
 *
 * Only what the atlas actually uses. Anything not listed is spoken as
 * written, lowercased, which is right for `Insula` and wrong for nothing
 * that has come up.
 */
const WORDS: Readonly<Record<string, string>> = {
  Sup: "superior",
  Mid: "middle",
  Inf: "inferior",
  Ant: "anterior",
  Post: "posterior",
  Med: "medial",
  Orb: "orbital",
  Oper: "opercular",
  Tri: "triangular",
  Supp: "supplementary",
  Cerebelum: "cerebellum",
  Crus1: "crus 1",
  Crus2: "crus 2",
};

/**
 * An AAL label as it should be said: `Frontal_Inf_Oper_L` becomes
 * `Left frontal inferior opercular`, `Cerebelum_4_5_R` becomes
 * `Right cerebellum 4 and 5`.
 *
 * The side goes first because it is the part a listener most wants to hear
 * confirmed, and it is the part most easily lost at the end of a name that
 * the next region cuts short.
 */
export function speakable(label: string): string {
  const parts = label.split("_").filter(Boolean);
  const words: string[] = [];

  const last = parts[parts.length - 1];
  if (last === "L" || last === "R") {
    words.push(last === "L" ? "left" : "right");
    parts.pop();
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const numeric = /^\d+$/.test(part);
    // Two numbers in a row are one lobule spanning both: "4 and 5", not "4 5".
    if (numeric && i > 0 && /^\d+$/.test(parts[i - 1])) words.push("and");
    words.push(WORDS[part] ?? part.toLowerCase());
  }

  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * How a label is spoken: the table's anatomical English where it has the
 * label, the generated name for anything it does not.
 */
export function spokenName(label: string): string {
  return SPOKEN_NAMES[label] ?? speakable(label);
}

/**
 * The name for a label value, or null for anything unlabelled.
 *
 * Zero is background in every label volume and is never named, whatever the
 * table calls it; AAL calls it `Air`.
 */
export function regionName(names: readonly string[], value: number): string | null {
  if (!Number.isInteger(value) || value <= 0 || value >= names.length) return null;
  return names[value];
}

/** Fetches the atlas and its label table. Rejects when either is unreachable. */
export async function loadAtlas(): Promise<Atlas> {
  const [image, table] = await Promise.all([
    NVImage.loadFromUrl({ url: ATLAS.volume }),
    fetch(ATLAS.labels).then((response) => {
      if (!response.ok) throw new Error(`atlas labels: ${response.status}`);
      return response.json() as Promise<{ labels: string[] }>;
    }),
  ]);

  const dims = image.hdr?.dims;
  if (!dims) throw new Error("atlas has no header");
  const names = table.labels.map(spokenName);
  const grid: [number, number, number] = [dims[1], dims[2], dims[3]];
  const img = image.img;
  const matRAS = image.matRAS;
  if (!img || !matRAS) throw new Error("atlas has no voxels");

  // `mm2vox` and `vox2mm` go through the atlas's own affine, so the scan's
  // grid never enters into it. AAL is stored in RAS already, so the voxel
  // they give is also the native one `getValue` and `img` index.
  const toMm = (vox: readonly number[]): [number, number, number] => {
    const mm = image.vox2mm([vox[0], vox[1], vox[2]], matRAS);
    return [mm[0], mm[1], mm[2]];
  };
  const toVox = (mm: readonly number[]): [number, number, number] | null => {
    const vox = image.mm2vox([mm[0], mm[1], mm[2]]);
    for (let axis = 0; axis < 3; axis++) {
      if (vox[axis] < 0 || vox[axis] >= grid[axis]) return null;
    }
    return [vox[0], vox[1], vox[2]];
  };
  const valueAt = (mm: readonly number[]): number => {
    const vox = toVox(mm);
    return vox ? image.getValue(vox[0], vox[1], vox[2]) : 0;
  };

  let regions: Region[] | null = null;

  return {
    regionAt(mm) {
      return regionName(names, valueAt(mm));
    },
    valueAt,
    regions() {
      // One pass over the whole volume, kept: the atlas never changes.
      regions ??= labelStats(img, grid).flatMap((stat) => {
        const label = table.labels[stat.value];
        const name = regionName(names, stat.value);
        if (!label || !name) return [];
        // The generated name stays as an alias, so what an agent learnt
        // before the table still finds the region.
        const generated = speakable(label);
        const aliases = generated === name ? [] : [generated];
        return [{ value: stat.value, label, name, aliases, centroid: toMm(stat.centroid), voxels: stat.voxels }];
      });
      return regions;
    },
    nearestIn(value, mm) {
      const from = image.mm2vox([mm[0], mm[1], mm[2]], true);
      const vox = nearestVoxel(img, grid, value, [from[0], from[1], from[2]]);
      return vox ? toMm(vox) : null;
    },
  };
}

/**
 * Speaks a region's name once, when the pointer has settled in it.
 *
 * Entering the same region again after leaving it is announced again: the
 * callout is for entry, not for novelty, and a listener sweeping back and
 * forth across a boundary is asking which side they are on each time.
 */
export class RegionCallout {
  private current: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private speech: Speech,
    private dwellMs = DWELL_MS,
  ) {}

  /** The pointer is over `region`, or over nothing labelled when null. */
  enter(region: string | null): void {
    if (region === this.current) return;
    this.current = region;
    this.clear();
    if (region === null) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      // Whatever was still being said is out of date by now.
      this.speech.hush();
      void this.speech.say(region);
    }, this.dwellMs);
  }

  /** The pointer left the volume. Nothing is said, and the next entry is fresh. */
  leave(): void {
    this.current = null;
    this.clear();
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
