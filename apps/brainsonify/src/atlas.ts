import { NVImage } from "@niivue/niivue";

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

/** Looks a world position up in the atlas. */
export interface Atlas {
  /** The spoken name of the region at `mm`, or null where nothing is labelled. */
  regionAt(mm: readonly number[]): string | null;
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
  const names = table.labels.map(speakable);

  return {
    regionAt(mm) {
      // `mm2vox` goes through the atlas's own affine, so the scan's grid never
      // enters into it. AAL is stored in RAS already, so the voxel this gives
      // is also the native one `getValue` reads.
      const vox = image.mm2vox([mm[0], mm[1], mm[2]]);
      for (let axis = 0; axis < 3; axis++) {
        if (vox[axis] < 0 || vox[axis] >= dims[axis + 1]) return null;
      }
      return regionName(names, image.getValue(vox[0], vox[1], vox[2]));
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
