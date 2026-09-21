/**
 * Which way to lay the four NiiVue tiles out: three planar views and the
 * render. NiiVue's own AUTO choice compares only the three planar layouts
 * and adds the render afterwards, so on a wide-ish stage it picks a row of
 * four where a two-by-two grid would give bigger tiles. This decides from the
 * stage's aspect ratio with the render counted in.
 *
 * Treating the tiles as roughly square: a grid's tile is half the shorter
 * side; a row's tile is a quarter of the width, so a row only wins once the
 * stage is wider than twice its height; a column's tile is a quarter of the
 * height, so it only wins once the stage is taller than twice its width. The
 * MNI152 tiles are not square, but working the same comparison through with
 * its 182 x 218 x 182 mm extents lands on the same two crossovers.
 */
export type PlanarLayout = "row" | "grid" | "column";

export function planarLayout(width: number, height: number): PlanarLayout {
  if (!(width > 0) || !(height > 0)) return "grid";
  const aspect = width / height;
  if (aspect > 2) return "row";
  if (aspect < 0.5) return "column";
  return "grid";
}
