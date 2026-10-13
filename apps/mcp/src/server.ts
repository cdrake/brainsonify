/**
 * The brainsonify MCP server: the NiiVue core with the sound tools on top.
 *
 * Everything general lives in `@niivue/nv-mcp/server`; this file names the
 * server, picks the port, and adds the brainsonify extension.
 */

import { startServer } from "@niivue/nv-mcp/server";

import { brainsonify } from "./brainsonify";

// Where the dev server puts the page, for the no-tab hint and for new_tab.
const PAGE = process.env.BRAINSONIFY_PAGE ?? "http://localhost:4200/?agent";

// What the page can load, which the tools cannot know: NiiVue's demo images.
const DEMOS = "https://niivue.github.io/niivue-demo-images/";
const ATLAS = "https://niivue.com/demos/images/";

startServer({
  name: "brainsonify",
  version: "0.1.0",
  port: Number(process.env.BRAINSONIFY_MCP_PORT ?? 4242),
  extensions: [brainsonify],
  pageUrl: PAGE,
  instructions:
    "The page opens empty; its own buttons load the MNI152 template, " +
    `${DEMOS}mni152.nii.gz, in MNI space, where the AAL atlas applies and list_regions and ` +
    `go_to_region know its regions, or one person's T1 scan with the head and skull, ${DEMOS}chris_t1.nii.gz, ` +
    "in its own space, where no atlas applies. load_volume takes either address. add_overlay can draw the AAL " +
    `atlas itself, ${ATLAS}aal.nii.gz, as a label map with its own names and colours when ${ATLAS}aal.json ` +
    "is passed as labels.",
  bridge: {
    noTabHint: `Open brainsonify with ?agent in the address (the dev server serves it at ${PAGE}) and try again.`,
  },
});
