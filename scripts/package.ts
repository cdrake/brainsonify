/**
 * Builds dist/package/brainsonify.zip: the app, its four images and a
 * launcher for macOS (Apple silicon and Intel), Windows and Linux, so it runs
 * with nothing installed and no network. `bun run package`.
 *
 * The images are downloaded here, into the gitignored dist/, rather than
 * kept in the repository. Runs on macOS, Linux or Windows.
 *
 * Mac signing, both optional (see README):
 *   MAC_SIGN_IDENTITY  a "Developer ID Application: ..." keychain identity; signs the Mac launchers
 *   NOTARY_PROFILE     a `xcrun notarytool store-credentials` profile; notarizes the signed zip
 */

import { $ } from "bun";
import { zipSync, type Zippable } from "fflate";
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

const { MAC_SIGN_IDENTITY, NOTARY_PROFILE } = process.env;
if (MAC_SIGN_IDENTITY) {
  for (const [target, name] of TARGETS) {
    if (!target.includes("darwin")) continue;
    // Hardened runtime, as notarization requires; the entitlements let Bun's JIT run under it.
    await $`codesign --force --timestamp --options runtime --entitlements scripts/entitlements.plist --sign ${MAC_SIGN_IDENTITY} ${join(STAGE, name)}`.cwd(ROOT);
    await $`codesign --verify --strict ${join(STAGE, name)}`;
  }
}

await cp(join(ROOT, "scripts/package-README.txt"), join(STAGE, "README.txt"));

// Zipped here rather than by a zip command, so Windows can package too; the Unix modes keep the
// Mac and Linux launchers executable however the zip was made.
const launchers = new Set(TARGETS.map(([, name]) => name));
const entries: Zippable = {};
for await (const file of new Bun.Glob("**/*").scan({ cwd: STAGE })) {
  const path = file.replaceAll("\\", "/");
  const mode = launchers.has(path) ? 0o100755 : 0o100644;
  entries[`brainsonify/${path}`] = [await Bun.file(join(STAGE, file)).bytes(), { os: 3, attrs: mode * 0x10000 }];
}
await Bun.write(join(OUT, "brainsonify.zip"), zipSync(entries));

if (NOTARY_PROFILE) {
  if (!MAC_SIGN_IDENTITY) throw new Error("NOTARY_PROFILE needs MAC_SIGN_IDENTITY: Apple notarizes signed code only.");
  // A bare executable cannot be stapled, so Gatekeeper looks the ticket up online on first launch.
  await $`xcrun notarytool submit brainsonify.zip --keychain-profile ${NOTARY_PROFILE} --wait`.cwd(OUT);
}
console.log(`\n${join(OUT, "brainsonify.zip")}`);
