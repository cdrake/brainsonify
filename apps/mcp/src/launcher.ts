/**
 * The offline launcher: what the zip from `scripts/package.ts` runs. Serves
 * the built page and its images from the `app/` folder beside the
 * executable, starts the MCP server, and opens the page in the browser.
 */

import { dirname, join, normalize, sep } from "node:path";

// Beside the executable, not the working directory: a Finder double-click starts in the home folder.
const APP = join(dirname(process.execPath), "app");
const PORT = Number(process.env.BRAINSONIFY_PORT ?? 4200);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PAGE = `${ORIGIN}/?agent`;

if (!(await Bun.file(join(APP, "index.html")).exists())) {
  console.error(`No app folder at ${APP}. Keep this program next to the app folder it came with.`);
  process.exit(1);
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    const file = normalize(join(APP, path === "/" ? "index.html" : path));
    // Refuse anything that climbs out of the app folder.
    if (file !== APP && !file.startsWith(APP + sep)) return new Response("Forbidden", { status: 403 });
    const body = Bun.file(file);
    return (await body.exists()) ? new Response(body) : new Response("Not found", { status: 404 });
  },
});

// server.ts reads these when it loads, so they are set before the import.
process.env.BRAINSONIFY_PAGE = PAGE;
process.env.BRAINSONIFY_IMAGES = `${ORIGIN}/data/`;
await import("./server");

// The browser gets the Virtual Helm open; PAGE stays plain for the agent's new_tab.
const SITE = `${PAGE}&helm=1`;
console.log(
  `\nbrainsonify is running at ${SITE}\nAgents connect to http://127.0.0.1:4242/mcp\n` +
    "Leave this window open while you use it; close it to quit.\n",
);
const open =
  process.platform === "win32" ? ["cmd", "/c", "start", "", SITE]
  : process.platform === "darwin" ? ["open", SITE]
  : ["xdg-open", SITE];
try {
  Bun.spawn(open, { stdout: "ignore", stderr: "ignore" });
} catch {
  // No opener (a Linux box without xdg-open): the address printed above is enough.
}
