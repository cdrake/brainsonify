# The brainsonify MCP server

`bun run mcp` from the repository root. This is the [niivue-mcp](../../libs/niivue-mcp/README.md)
core with brainsonify's sound tools registered on it as an extension:
`src/server.ts` names the server and picks the port, `src/brainsonify.ts`
holds the tools, and `apps/brainsonify/src/controllers/agent.ts` answers
them in the page.

The port is 4242 unless `BRAINSONIFY_MCP_PORT` says otherwise.

## The brainsonify extension

Four tools on top of the core's nine, for an app that sonifies the voxel
under the crosshair and talks to a listener:

| Tool | Input | What it does |
|---|---|---|
| `set_sound` | `on` | Starts or stops the sonification, as the **Enable sound** button does. Browsers only start audio after a click in the page, so the first turn-on may be refused with a message asking for one; the tool waits a second and a half before saying so |
| `list_modes` | | The modes the panel's **Mapping** control offers, from the control schema, and the one in use |
| `set_mode` | `mode` | Chooses how the continuous voice is made |
| `announce` | `text` | Puts a line in the status line and live region, and speaks it while sound is on: what the app itself says when the knob changes or an agent moves the crosshair |

`where_am_i` gains `sounding` and `mode`, and the note after a reload
covers them, because the page adds both to the state it reports.

The extension is the only part that imports `@brainsonify/control`; it
takes the mode list from `CONTROL_SCHEMA` so the tool's enum and the panel
cannot drift apart.

## Tests

`bunx nx test mcp` runs `src/server.spec.ts`, which starts this server as a
Bun process on a free port, connects an MCP client to it over HTTP, and
drives pages through every tool. There is no headless browser in the
repository, so the pages are `src/testing/fake-page.ts` run as processes:
the real client and the real core handlers over a pretend NiiVue, a
four-region atlas and a sound that remembers whether it is on. The
sockets, the hellos, the routing between two tabs and the reload path are
the real ones; only the scene is fake.
