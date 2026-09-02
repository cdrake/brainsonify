/**
 * Finding bone by its shape rather than its brightness.
 *
 * On a T1, cortical bone is a signal void: it is the *darkest* thing in the
 * head, indistinguishable by intensity from air, CSF or the background. What
 * makes it findable is geometry. The skull is a thin dark sheet sandwiched
 * between bright scalp fat and bright diploë, and almost nothing else in the
 * head is shaped like that.
 *
 * The Hessian is the standard way to ask "is this voxel part of a sheet?".
 * Its eigenvalues describe how intensity curves in three orthogonal directions;
 * a plate curves sharply across itself and barely at all along itself, so
 * |l1| ~ |l2| ~ 0 and |l3| large. A *dark* plate on a bright ground has l3 > 0.
 *
 * Everything here is pure and framework-free so it can be unit-tested and run
 * inside a worker. It is a load-time precompute: the result is sampled O(1) per
 * pointer move, exactly like the colormap lookup.
 */

export type Dims = readonly [number, number, number];
/** Millimetres per voxel on each axis. */
export type Zoom = readonly [number, number, number];

export interface Grid {
  data: Float32Array;
  dims: Dims;
  zoom: Zoom;
}

/** A precomputed boneness volume, possibly coarser than the volume it describes. */
export interface BoneMap {
  data: Float32Array;
  dims: Dims;
  /** Full-resolution voxels per entry on each axis. */
  factor: number;
  /** Millimetres per entry on each axis, for reasoning in anatomy not indices. */
  zoom: Zoom;
}

const index = (i: number, j: number, k: number, [nx, ny]: Dims) => i + nx * (j + ny * k);

/* ---------------- separable filtering ---------------- */

/**
 * A sampled Gaussian, or one of its first two derivatives.
 *
 * The zeroth-order kernel is normalised to sum to 1 and the derivatives are
 * taken from it analytically, which keeps the scales comparable. Discretising a
 * second derivative leaves a small DC residual that would register as a
 * uniform intensity offset — a fake sheet everywhere — so it is subtracted off.
 */
export function gaussianKernel(sigma: number, order: 0 | 1 | 2): Float32Array {
  const radius = Math.max(1, Math.ceil(4 * sigma));
  const k = new Float32Array(2 * radius + 1);

  let sum = 0;
  for (let x = -radius; x <= radius; x++) {
    const g = Math.exp(-(x * x) / (2 * sigma * sigma));
    k[x + radius] = g;
    sum += g;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  if (order === 0) return k;

  const s2 = sigma * sigma;
  for (let x = -radius; x <= radius; x++) {
    const g = k[x + radius];
    k[x + radius] = order === 1 ? (-x / s2) * g : ((x * x - s2) / (s2 * s2)) * g;
  }

  let dc = 0;
  for (const v of k) dc += v;
  const mean = dc / k.length;
  for (let i = 0; i < k.length; i++) k[i] -= mean;
  return k;
}

/** One separable pass along `axis`, clamping at the borders. */
export function convolve1d(
  src: Float32Array,
  dst: Float32Array,
  dims: Dims,
  axis: 0 | 1 | 2,
  kernel: Float32Array,
): void {
  const strides: Dims = [1, dims[0], dims[0] * dims[1]];
  const stride = strides[axis];
  const n = dims[axis];
  const radius = (kernel.length - 1) / 2;

  const a1 = ((axis + 1) % 3) as 0 | 1 | 2;
  const a2 = ((axis + 2) % 3) as 0 | 1 | 2;

  for (let u = 0; u < dims[a1]; u++) {
    for (let v = 0; v < dims[a2]; v++) {
      const base = u * strides[a1] + v * strides[a2];
      for (let t = 0; t < n; t++) {
        let acc = 0;
        for (let d = -radius; d <= radius; d++) {
          const s = t + d < 0 ? 0 : t + d >= n ? n - 1 : t + d;
          acc += src[base + s * stride] * kernel[d + radius];
        }
        dst[base + t * stride] = acc;
      }
    }
  }
}

/** Halves each axis by box-averaging. Bone is 4-7mm thick; 2mm voxels resolve it fine. */
export function downsample2(grid: Grid): Grid {
  const [nx, ny, nz] = grid.dims;
  const dims: Dims = [Math.ceil(nx / 2), Math.ceil(ny / 2), Math.ceil(nz / 2)];
  const out = new Float32Array(dims[0] * dims[1] * dims[2]);

  for (let k = 0; k < dims[2]; k++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let i = 0; i < dims[0]; i++) {
        let sum = 0;
        let n = 0;
        for (let dk = 0; dk < 2; dk++) {
          const kk = 2 * k + dk;
          if (kk >= nz) continue;
          for (let dj = 0; dj < 2; dj++) {
            const jj = 2 * j + dj;
            if (jj >= ny) continue;
            for (let di = 0; di < 2; di++) {
              const ii = 2 * i + di;
              if (ii >= nx) continue;
              sum += grid.data[index(ii, jj, kk, grid.dims)];
              n++;
            }
          }
        }
        out[index(i, j, k, dims)] = n > 0 ? sum / n : 0;
      }
    }
  }

  return {
    data: out,
    dims,
    zoom: [grid.zoom[0] * 2, grid.zoom[1] * 2, grid.zoom[2] * 2],
  };
}

/* ---------------- eigenvalues ---------------- */

/**
 * Eigenvalues of a symmetric 3x3, smallest to largest in absolute value.
 *
 * Closed form rather than an iterative solver: this runs once per voxel per
 * scale, so a few million times, and the trigonometric solution is exact for
 * the symmetric case.
 */
export function eigSym3(
  a00: number, a01: number, a02: number,
  a11: number, a12: number, a22: number,
): [number, number, number] {
  const q = (a00 + a11 + a22) / 3;
  const p1 = a01 * a01 + a02 * a02 + a12 * a12;
  const p2 = (a00 - q) ** 2 + (a11 - q) ** 2 + (a22 - q) ** 2 + 2 * p1;
  const p = Math.sqrt(Math.max(p2 / 6, 1e-30));

  const b00 = (a00 - q) / p, b11 = (a11 - q) / p, b22 = (a22 - q) / p;
  const b01 = a01 / p, b02 = a02 / p, b12 = a12 / p;
  const det =
    b00 * (b11 * b22 - b12 * b12) -
    b01 * (b01 * b22 - b12 * b02) +
    b02 * (b01 * b12 - b11 * b02);

  const phi = Math.acos(Math.min(1, Math.max(-1, det / 2))) / 3;
  const e1 = q + 2 * p * Math.cos(phi);
  const e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  const e2 = 3 * q - e1 - e3;

  const e = [e1, e2, e3];
  e.sort((x, y) => Math.abs(x) - Math.abs(y));
  return [e[0], e[1], e[2]];
}

/* ---------------- sheetness ---------------- */

/**
 * Plate-like response at one scale, for dark sheets on a brighter ground.
 *
 * `plate` is 1 when the surface curves in only one direction and falls to 0 as
 * it starts curving in two (a tube) or three (a blob). `strength` suppresses
 * the near-flat noise that would otherwise score as a perfect plate simply
 * because nothing is happening. Responses are gamma-normalised by sigma^2 so
 * that scales can be compared.
 *
 * `normal` is what makes this find bone rather than merely dark sheets. Sulcal
 * CSF is also a thin dark sheet and scores just as well on plateness alone — on
 * a skull-stripped volume that produced a *higher* response than a real skull,
 * which would have had the channel rattling confidently on the cortical surface.
 * What separates them is orientation: the skull lies parallel to the scalp and
 * sulci run inward from it. n^T H n over |l3| is 1 when the sheet's own normal
 * points along the surface normal and falls to 0 as it turns perpendicular.
 */
export function sheetness(
  grid: Grid,
  sigmaMm: number,
  normal?: readonly [Float32Array, Float32Array, Float32Array],
): Float32Array {
  const { dims } = grid;
  const n = dims[0] * dims[1] * dims[2];
  const sigma: Dims = [sigmaMm / grid.zoom[0], sigmaMm / grid.zoom[1], sigmaMm / grid.zoom[2]];

  const pairs = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]] as const;
  const H = pairs.map(([a, b]) => {
    let src = grid.data;
    let dst = new Float32Array(n);
    for (const axis of [0, 1, 2] as const) {
      const order = ((a === axis ? 1 : 0) + (b === axis ? 1 : 0)) as 0 | 1 | 2;
      convolve1d(src, dst, dims, axis, gaussianKernel(sigma[axis], order));
      src = dst;
      dst = new Float32Array(n);
    }
    const scaled = src;
    for (let i = 0; i < n; i++) scaled[i] *= sigmaMm * sigmaMm;
    return scaled;
  });
  const [h00, h01, h02, h11, h12, h22] = H;

  // ||H||_F^2 equals l1^2+l2^2+l3^2, so the noise floor is available without
  // decomposing anything.
  let frobMax = 0;
  for (let i = 0; i < n; i++) {
    const f =
      h00[i] ** 2 + h11[i] ** 2 + h22[i] ** 2 +
      2 * (h01[i] ** 2 + h02[i] ** 2 + h12[i] ** 2);
    if (f > frobMax) frobMax = f;
  }
  const c2 = 2 * (0.5 * Math.sqrt(frobMax)) ** 2 + 1e-12;

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [, l2, l3] = eigSym3(h00[i], h01[i], h02[i], h11[i], h12[i], h22[i]);
    if (l3 <= 0) continue; // a bright sheet, not the dark one bone makes

    const a2 = Math.abs(l2);
    const a3 = Math.abs(l3);
    const plate = (a3 - a2) / (a3 + 1e-8);
    const frob2 =
      h00[i] ** 2 + h11[i] ** 2 + h22[i] ** 2 +
      2 * (h01[i] ** 2 + h02[i] ** 2 + h12[i] ** 2);

    let aligned = 1;
    if (normal) {
      const [nx, ny, nz] = normal;
      const x = nx[i], y = ny[i], z = nz[i];
      const curvature =
        x * x * h00[i] + y * y * h11[i] + z * z * h22[i] +
        2 * (x * y * h01[i] + x * z * h02[i] + y * z * h12[i]);
      aligned = Math.min(1, Math.max(0, curvature / a3));
    }

    out[i] = plate * (1 - Math.exp(-frob2 / c2)) * aligned;
  }
  return out;
}

/* ---------------- depth from the scalp ---------------- */

/** Felzenszwalb's exact 1D squared distance transform, in millimetres. */
function edt1d(f: Float64Array, n: number, spacing: number): Float64Array {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const out = new Float64Array(n);
  const s2 = spacing * spacing;

  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;

  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k];
      s = (f[q] + s2 * q * q - (f[p] + s2 * p * p)) / (2 * s2 * (q - p));
      if (s > z[k]) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    out[q] = s2 * (q - p) * (q - p) + f[p];
  }
  return out;
}

/**
 * How far each voxel sits beneath the outer surface of the head, in mm.
 *
 * This is what separates skull from sulci. Both are thin dark sheets and the
 * Hessian likes both, but the skull is a shell a few millimetres under the
 * scalp and the sulci are everywhere else. Interior air — the sinuses, the ear
 * canals — is filled first, or it would read as a second outer surface and put
 * a spurious shell around the middle of the head.
 */
export function depthFromSurface(grid: Grid, airThreshold: number): Float32Array {
  const { dims } = grid;
  const [nx, ny, nz] = dims;
  const n = nx * ny * nz;

  const head = new Uint8Array(n);
  for (let i = 0; i < n; i++) head[i] = grid.data[i] > airThreshold ? 1 : 0;

  // Flood the outside air in from the border; whatever background it never
  // reaches is an interior pocket and belongs to the head.
  const outside = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const push = (i: number) => {
    if (!head[i] && !outside[i]) {
      outside[i] = 1;
      stack[top++] = i;
    }
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1)
          push(index(i, j, k, dims));

  while (top > 0) {
    const at = stack[--top];
    const i = at % nx;
    const j = ((at - i) / nx) % ny;
    const k = Math.floor(at / (nx * ny));
    if (i > 0) push(at - 1);
    if (i < nx - 1) push(at + 1);
    if (j > 0) push(at - nx);
    if (j < ny - 1) push(at + nx);
    if (k > 0) push(at - nx * ny);
    if (k < nz - 1) push(at + nx * ny);
  }

  const INF = 1e20;
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = outside[i] ? 0 : INF;

  const strides: Dims = [1, nx, nx * ny];
  for (const axis of [0, 1, 2] as const) {
    const len = dims[axis];
    const a1 = ((axis + 1) % 3) as 0 | 1 | 2;
    const a2 = ((axis + 2) % 3) as 0 | 1 | 2;
    const line = new Float64Array(len);
    for (let u = 0; u < dims[a1]; u++) {
      for (let v = 0; v < dims[a2]; v++) {
        const base = u * strides[a1] + v * strides[a2];
        for (let t = 0; t < len; t++) line[t] = f[base + t * strides[axis]];
        const done = edt1d(line, len, grid.zoom[axis]);
        for (let t = 0; t < len; t++) f[base + t * strides[axis]] = done[t];
      }
    }
  }

  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) depth[i] = Math.sqrt(f[i]);
  return depth;
}

/**
 * Unit normal of the head surface at every voxel, from the depth field.
 *
 * Depth increases straight inward from the scalp, so its gradient is the
 * surface normal carried through the whole volume — including out at the skull,
 * where it says which way "inward" points locally.
 */
export function surfaceNormal(
  depth: Float32Array,
  dims: Dims,
  zoom: Zoom,
): [Float32Array, Float32Array, Float32Array] {
  const [nx, ny, nz] = dims;
  const n = nx * ny * nz;
  const out: [Float32Array, Float32Array, Float32Array] = [
    new Float32Array(n), new Float32Array(n), new Float32Array(n),
  ];
  const strides: Dims = [1, nx, nx * ny];
  const counts: Dims = [nx, ny, nz];

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const at = index(i, j, k, dims);
        const pos: Dims = [i, j, k];
        let len = 0;
        const g: number[] = [0, 0, 0];
        for (const axis of [0, 1, 2] as const) {
          const lo = pos[axis] > 0 ? at - strides[axis] : at;
          const hi = pos[axis] < counts[axis] - 1 ? at + strides[axis] : at;
          const span = (pos[axis] > 0 ? 1 : 0) + (pos[axis] < counts[axis] - 1 ? 1 : 0);
          g[axis] = span > 0 ? (depth[hi] - depth[lo]) / (span * zoom[axis]) : 0;
          len += g[axis] * g[axis];
        }
        len = Math.sqrt(len);
        if (len > 1e-6) {
          out[0][at] = g[0] / len;
          out[1][at] = g[1] / len;
          out[2][at] = g[2] / len;
        }
      }
    }
  }
  return out;
}

/* ---------------- the pipeline ---------------- */

export interface BonenessOptions {
  /** Sheet thicknesses to look for, in mm. The vault answers around 3mm. */
  scalesMm?: readonly number[];
  /** Depth band the skull occupies, in mm below the scalp. */
  shellMm?: readonly [number, number];
  /** Normalised intensity below which a voxel counts as air. */
  airThreshold?: number;
  /**
   * Blur applied to the finished map, in mm.
   *
   * The plate term is unstable where the two larger curvatures are close, which
   * speckles the response along the vault. Left alone, sweeping the skull makes
   * bone rattle *intermittently*, which reads as noise rather than as an edge.
   * Boneness is a regional property and gets sampled at a point, so a little
   * blur costs nothing real and buys a continuous surface.
   */
  smoothMm?: number;
  /**
   * Raw response mapped onto the 0..1 the tap rate spends, as `[floor, peak]`.
   *
   * The raw numbers are small and their scale means nothing on its own, so they
   * have to be pinned against measured volumes rather than against each map's
   * own maximum — normalising a map by its own peak would make a volume with no
   * skull in it rattle just as hard as one with a skull, which is precisely the
   * failure this filter was rebuilt to avoid. Measured across the shell band:
   *
   * ```
   *                      >0.05    >0.1     >0.15
   * chris_t1 (skull)     2.477%   0.941%   0.386%
   * mni152   (stripped)  0.043%   0.001%   0.000%
   * ```
   *
   * The floor sits above where a skull-free volume has all but died out, and
   * the peak where a real vault still has voxels to spare.
   */
  calibration?: readonly [number, number];
}

/**
 * Boneness for a whole volume, as a coarse map to sample per pointer move.
 *
 * Runs on a half-resolution copy. The skull is 4-7mm thick, so 2mm voxels
 * resolve it comfortably, and the eightfold drop in voxel count is the
 * difference between a pause the user notices and one they do not.
 */
export function computeBoneness(grid: Grid, options: BonenessOptions = {}): BoneMap {
  const {
    scalesMm = [1.5, 3],
    shellMm = [1.5, 12],
    airThreshold = 0.08,
    smoothMm = 1,
    calibration = [0.05, 0.25],
  } = options;

  const half = downsample2(grid);
  const n = half.dims[0] * half.dims[1] * half.dims[2];

  const depth = depthFromSurface(half, airThreshold);
  const normal = surfaceNormal(depth, half.dims, half.zoom);

  const best = new Float32Array(n);
  for (const sigma of scalesMm) {
    const r = sheetness(half, sigma, normal);
    for (let i = 0; i < n; i++) if (r[i] > best[i]) best[i] = r[i];
  }

  const [near, far] = shellMm;
  for (let i = 0; i < n; i++) {
    if (depth[i] < near || depth[i] > far) best[i] = 0;
  }

  let out = best;
  if (smoothMm > 0) {
    let src = best;
    let dst = new Float32Array(n);
    for (const axis of [0, 1, 2] as const) {
      convolve1d(src, dst, half.dims, axis, gaussianKernel(smoothMm / half.zoom[axis], 0));
      [src, dst] = [dst, src];
    }
    out = src;
  }

  const [floor, peak] = calibration;
  const span = peak - floor;
  for (let i = 0; i < n; i++) {
    out[i] = span > 0 ? Math.min(1, Math.max(0, (out[i] - floor) / span)) : 0;
  }

  return { data: out, dims: half.dims, factor: 2, zoom: half.zoom };
}

/**
 * The strongest bone within `radiusMm` of each voxel.
 *
 * Sampling boneness at a point is the right measurement and the wrong probe.
 * The skull is a 4-7mm shell, which is a razor-thin target to hover: a raster
 * of the 2D tiles put 52 of 73,616 points on it. Worse, on the 3D render the
 * depth pick lands on the *scalp*, and the skull is several millimetres beneath
 * that — so the one view the channel was built for could never sound bone at
 * all without clipping the head open first.
 *
 * A short probe fixes both. Asking "what is the densest thing within reach of
 * here" turns the shell into a target you can find by sweeping, and lets a
 * pointer resting on the scalp report the bone underneath it, the way pressing
 * on your own head does. The reach is a box rather than a sphere, since three
 * separable passes are far cheaper than a spherical structuring element and at
 * these radii the corners are a fraction of a voxel apart from it.
 *
 * Returns a new map; the source is left alone so the reach can be changed
 * without recomputing the filter, which is the expensive half.
 */
export function reach(map: BoneMap, radiusMm: number): BoneMap {
  const n = map.dims[0] * map.dims[1] * map.dims[2];
  let src = Float32Array.from(map.data);
  let dst = new Float32Array(n);

  if (radiusMm > 0) {
    for (const axis of [0, 1, 2] as const) {
      const radius = Math.round(radiusMm / map.zoom[axis]);
      if (radius < 1) continue;
      maxAlongAxis(src, dst, map.dims, axis, radius);
      [src, dst] = [dst, src];
    }
  }

  return { ...map, data: src };
}

/** Sliding-window maximum along one axis, clamped at the ends. */
function maxAlongAxis(
  src: Float32Array,
  dst: Float32Array,
  dims: Dims,
  axis: 0 | 1 | 2,
  radius: number,
): void {
  const strides: Dims = [1, dims[0], dims[0] * dims[1]];
  const stride = strides[axis];
  const n = dims[axis];

  const a1 = ((axis + 1) % 3) as 0 | 1 | 2;
  const a2 = ((axis + 2) % 3) as 0 | 1 | 2;

  for (let u = 0; u < dims[a1]; u++) {
    for (let v = 0; v < dims[a2]; v++) {
      const base = u * strides[a1] + v * strides[a2];
      for (let t = 0; t < n; t++) {
        let best = 0;
        const lo = Math.max(0, t - radius);
        const hi = Math.min(n - 1, t + radius);
        for (let s = lo; s <= hi; s++) {
          const value = src[base + s * stride];
          if (value > best) best = value;
        }
        dst[base + t * stride] = best;
      }
    }
  }
}

/** Boneness at a full-resolution voxel index. Nearest entry; no interpolation. */
export function bonenessAt(map: BoneMap, i: number, j: number, k: number): number {
  const [nx, ny, nz] = map.dims;
  const ci = Math.min(nx - 1, Math.max(0, Math.round(i / map.factor)));
  const cj = Math.min(ny - 1, Math.max(0, Math.round(j / map.factor)));
  const ck = Math.min(nz - 1, Math.max(0, Math.round(k / map.factor)));
  return map.data[index(ci, cj, ck, map.dims)];
}
