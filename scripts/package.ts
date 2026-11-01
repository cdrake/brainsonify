/**
 * Builds dist/package/brainsonify.zip: the app, its four images and a
 * launcher for macOS (Apple silicon and Intel), Windows and Linux, so it runs
 * with nothing installed and no network. `bun run package`.
 *
 * The images are downloaded here, into the gitignored dist/, rather than
 * kept in the repository.
 */

import { $ } from "bun";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "dist/package");
const STAGE = join(OUT, "brainsonify");
const IMAGES = [
  "https://niivue.github.io/niivue-demo-images/mni152.nii.gz",
  "https://niivue.github.io/niivue-demo-images/chris_t1.nii.gz",
  "https://niivue.com/demos/images/aal.nii.gz",
  "https://niivue.com/demos/images/aal.json",
];
const TARGETS = [
  ["bun-darwin-arm64", "brainsonify-mac-apple-silicon"],
  ["bun-darwin-x64", "brainsonify-mac-intel"],
  ["bun-windows-x64", "brainsonify-windows.exe"],
  ["bun-linux-x64", "brainsonify-linux-x64"],
  ["bun-linux-arm64", "brainsonify-linux-arm64"],
];

await rm(OUT, { recursive: true, force: true });
await mkdir(join(STAGE, "app/data"), { recursive: true });

// The page, with every image pointed at app/data/. Skip Nx's cache: it does not see the env var.
await $`bunx nx build brainsonify --skip-nx-cache`.cwd(ROOT).env({ ...process.env, VITE_IMAGES: "data/" });
await cp(join(ROOT, "dist/apps/brainsonify"), join(STAGE, "app"), { recursive: true });

for (const url of IMAGES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  // Buffered: Bun.write of a streamed Response hung on the second download (Bun 1.3.13).
  await Bun.write(join(STAGE, "app/data", url.split("/").pop()!), await res.arrayBuffer());
}

for (const [target, name] of TARGETS) {
  await $`bun build --compile --minify --target=${target} apps/mcp/src/launcher.ts --outfile ${join(STAGE, name)}`.cwd(ROOT);
}

await cp(join(ROOT, "scripts/package-README.txt"), join(STAGE, "README.txt"));

// shortcut: needs the zip command, so package on macOS or Linux, not Windows.
await $`zip -qry brainsonify.zip brainsonify`.cwd(OUT);
console.log(`\n${join(OUT, "brainsonify.zip")}`);
