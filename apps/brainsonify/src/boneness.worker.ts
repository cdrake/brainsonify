/**
 * Runs the bone map off the main thread.
 *
 * The pipeline is a second or so of dense float work on a whole volume. On the
 * main thread that is a second of frozen pointer, which in an app whose entire
 * interaction is hover would read as the app having died.
 *
 * The grid arrives as a transferred buffer and the finished map goes back the
 * same way, so neither crossing copies the volume.
 */
import { computeBoneness, type BoneMap, type Grid } from "./boneness";

export interface BoneRequest {
  /** Identifies the volume this was asked for; a stale reply is dropped. */
  token: number;
  grid: Grid;
}

export interface BoneReply {
  token: number;
  map: BoneMap;
}

/**
 * `self` types as a Window under the DOM lib, whose postMessage wants an origin.
 * Narrowing it here beats pulling the webworker lib in, which would collide
 * with the DOM types the rest of the app is built against.
 */
const post = self.postMessage as (message: BoneReply, transfer: Transferable[]) => void;

addEventListener("message", (event: MessageEvent<BoneRequest>) => {
  const { token, grid } = event.data;
  const map = computeBoneness(grid);
  post({ token, map }, [map.data.buffer]);
});
