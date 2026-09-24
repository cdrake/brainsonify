# niivue-mcp

An [MCP](https://modelcontextprotocol.io) server for a [NiiVue](https://niivue.com)
page. An agent connects to the server over streamable HTTP; the page keeps a
WebSocket open to the same server; each tool call is written to the page as
one JSON request and answered with one JSON response. The server holds no
anatomy and no scene of its own, so it stays small and the page stays the
one place the state lives.

The package has three entry points, and nothing in it knows about the app
that hosts it:

| Entry | Runs in | Holds |
|---|---|---|
| `niivue-mcp` | both | The wire messages, the plane arithmetic, region matching and the AAL spoken-name table |
| `niivue-mcp/server` | Bun | The bridge that knows tabs by id, the core tools, `startServer` |
| `niivue-mcp/browser` | the page | The client that keeps the socket open, and the handlers that answer the core tools from a NiiVue instance |

An app adds its own tools as an *extension* (see
[apps/mcp/README.md](../../apps/mcp/README.md) for brainsonify's) without
touching the core.

## Running the server

The server is a Bun process, because it uses `Bun.serve` for the HTTP and
WebSocket ends together:

```ts
import { startServer } from "niivue-mcp/server";

startServer({ name: "my-niivue-app", version: "0.1.0" });
```

That listens on `127.0.0.1:4242` (both configurable) and serves three
paths:

| Path | What |
|---|---|
| `/mcp` | The streamable HTTP endpoint an agent's client connects to. Stateless: each request gets its own `McpServer`, all sharing one bridge. |
| `/app` | The WebSocket the page keeps open |
| `/` | A plain-text status page listing the connected tabs, with `*` on the one that answers |

`startServer` returns the running server with its `bridge`, `url`, `appUrl`
and a `stop()`. Pass `log` to route its lines somewhere other than the
console, and `bridge` to supply your own (the tests do).

## Tabs

Every page that connects says hello with an id, a title, its address and
its state. The id is kept in the tab's `sessionStorage`, which a browser
scopes to one tab and keeps across reloads, so a reload arrives as the
same id on a new socket and a second tab arrives as a new id.

Which tab answers a call:

- **One tab connected**: that one.
- **A tab chosen with `use_tab`**: that one, for as long as it is connected.
- **Several connected and none chosen**: the one that answered last, if it
  is still connected; otherwise the call fails and lists the tabs, so the
  agent can call `use_tab` rather than drive a tab nobody is looking at.
- **The tab reloads mid-call**: the call fails saying so. On the next call
  the bridge waits a few seconds for the same id to come back, then answers
  from it and puts a note at the top of the reply saying the tab reloaded
  and what its state was before and is now, so the agent knows the
  crosshair, plane and anything the app adds started over. The note is
  said once.
- **No tab connected**: the call fails with a message saying what to open.

Every answer carries `tab: {id, title}` in `where_am_i`, and `list_tabs`
marks the one that is answering.

## The core tools

| Tool | Input | What it does |
|---|---|---|
| `list_tabs` | | The connected tabs: id, title, address, when each connected and which one answers |
| `use_tab` | `id` | Makes one tab the one that answers every later call |
| `load_volume` | `url`, `name?`, `colormap?`, `mni?` | Loads a volume from an address the page can fetch, replacing what is shown. `mni` says whether the atlas applies; guessed from the name when left out. Reports the name and the volume's bounds in millimetres |
| `where_am_i` | | The crosshair in millimetres and fractions, the plane cut, the camera, the page's description of the place, and whatever state the app adds. Says which tab answered |
| `list_regions` | `query?` | The atlas regions the page can navigate to: label, spoken name, centroid in millimetres, voxel count. `query` filters by label or name |
| `go_to_region` | `region`, `plane?` | Moves the crosshair to a region's centroid, turns the camera to face the cut, cuts a plane through the point, and announces the place. `plane` is a side, a slice name or `current`. An ambiguous name fails and lists the candidates |
| `set_clip_plane` | `plane`, `depth?`, `face?` | Cuts the volume with a whole plane named for the side it takes off, or `off`. `depth` is NiiVue's, clamped to ±1.5; `face` turns the camera to look at the cut, on by default |
| `set_camera` | `azimuth`, `elevation` | Points the render camera |
| `screenshot` | `max_width?` | Draws the scene and returns the canvas as a PNG, scaled down to fit |

Every reply is a line of prose for the agent to read, then the JSON the
page returned. Failures are tool errors with the page's own message.

### Planes and cameras

A plane is named for the side it takes off: `left`, `right`, `posterior`,
`anterior`, `inferior`, `superior`, with `sagittal`, `coronal` and `axial`
as aliases for the first of each pair. NiiVue keeps a clip plane as
`[depth, azimuth, elevation]`, with the shader keeping the side the plane's
normal points to; the camera that sees the exposed face square on looks
*along* the normal, which works out to the plane's own elevation and its
azimuth turned half a turn. `cameraForPlane` does that sum and
`depthThrough` finds the depth that puts the plane through a point, both
checked for all six sides in `planes.spec.ts`.

### Regions

`findRegion` matches a query against each region's label and spoken name:
exactly first, then by containment with case and underscores ignored. One
hit is a match; several hits are an ambiguity, reported with the candidate
names, unless one of them is exact. `SPOKEN_NAMES` is the AAL table in
anatomical English (`Frontal_Inf_Tri_L` → `left inferior frontal gyrus,
triangular part`), with a name generated from the label's parts for any
label not in it.

## Connecting a client

The page's client tries two addresses in turn: `/agent` on the page's own
origin, then the server directly on port 4242. The first is for browsers
that let a page reach one origin only, such as the pane inside Claude's
desktop app, and needs the dev server to proxy it. In Vite:

```ts
server: {
  proxy: {
    "/agent": {
      target: "ws://127.0.0.1:4242",
      ws: true,
      rewrite: (path) => path.replace(/^\/agent/, "/app"),
    },
  },
},
```

An agent attaches to `/mcp`. For Claude Code:

```bash
claude mcp add --transport http my-niivue-app http://127.0.0.1:4242/mcp
```

The Claude desktop app only takes a custom connector over HTTPS, so it
reaches the server through the `mcp-remote` bridge instead, as a local
server in `claude_desktop_config.json`:

```json
"mcpServers": {
  "my-niivue-app": {
    "command": "/opt/homebrew/bin/npx",
    "args": ["-y", "mcp-remote", "http://127.0.0.1:4242/mcp"]
  }
}
```

The full path to `npx` matters: the app is launched without a shell, so it
does not have Homebrew on its `PATH`.

## Embedding in another NiiVue app

Three steps on the page and one on the server.

**1. Describe the page to the core.** A `NiiVueHost` is the NiiVue instance
plus optional hooks. Only `view` is required; the core works on a plain
NiiVue with no atlas, with `list_regions` and `go_to_region` declining
politely.

```ts
import { AgentClient, coreHandlers, sceneState, type NiiVueHost } from "niivue-mcp/browser";

const host: NiiVueHost = {
  view: nv,                          // the Niivue instance
  atlas: () => loadAtlas(),          // optional: regions, regionAt, valueAt, nearestIn
  atlasApplies: () => isMni,         // optional: false on a scan the atlas does not fit
  beforeAnswer: () => fitCanvas(),   // optional: anything to do before reading the scene
  moved: (frac) => sample(frac),     // optional: called after go_to_region lands
  describe: () => whereWeAre(),      // optional: the prose for where_am_i and the announcement
  announce: (text) => say(text),     // optional: how the page tells the person
  loaded: ({ mni }) => { isMni = mni; },
  extraState: () => ({}),            // optional: state the server should watch across a reload
  planeName: () => currentCutName(), // optional: the page's own name for the plane
};
```

`AtlasLike` is four functions over millimetre coordinates. brainsonify's
atlas reads the AAL volume with `nifti-reader-js` and NiiVue's `nii2volume`
and answers them from the voxel grid; any atlas that can give a region's
centroid and say what is at a point will do.

**2. Open the client.**

```ts
const client = new AgentClient(coreHandlers(host), {
  state: () => sceneState(host),
  onStatus: (connected) => statusLine.textContent = connected ? `agent server connected (tab ${client.id})` : "agent server not reached",
});
client.attach();
```

`urls` defaults to `agentUrls()`, the two addresses above; pass one to
reach a server elsewhere. The client retries with a backoff that settles
at half a minute, so the order the two are started in does not matter.

**3. Add your own tools, if any.** Extra handlers are just more entries in
the object passed to `AgentClient`; they receive the tool's arguments and
return the JSON the agent sees, or throw to fail the call. Add their state
to what the `state` callback returns and the reload note will cover it.

**4. Register them on the server.** An `Extension` is a name and a
`register(server, context)` that calls `server.registerTool` for each
tool, answering through `context.answer(method, params, shape)`, which
forwards to the bound tab and wraps the reply. Pass it to `startServer`:

```ts
startServer({ name: "my-niivue-app", version: "0.1.0", extensions: [mine] });
```

`apps/mcp/src/brainsonify.ts` is a complete example, and
`apps/mcp/src/testing/fake-page.ts` is a page with no browser at all, which
the end-to-end test runs as a process.

## What the core needs from its host

For forking into another repository, this is everything the core reaches
for outside its own directory:

- **NiiVue.** Written against `@niivue/niivue` 1.0.0-rc.14. The `View`
  interface in `browser/scene.ts` lists exactly what is used: `canvas`,
  `volumes`, `azimuth`, `elevation`, `crosshairPos`, `getCrosshairPos`,
  `getClipPlaneDepthAziElev`, `setClipPlane`, `loadVolumes`, `drawScene`
  and `model.mm2scene` / `scene2mm`. `crosshairPos` is a gl-matrix `vec3`,
  hence the loose `Triple` type. A NiiVue that keeps those names works
  without changes to the core.
- **An atlas, if regions are wanted.** The core carries only the AAL name
  table; the volume and its labels are the host's. brainsonify fetches
  `https://niivue.com/demos/images/aal.nii.gz` and `aal.json` at runtime
  and reads them with `nifti-reader-js` 0.8 plus NiiVue's `nii2volume`,
  with the voxel arithmetic in `apps/brainsonify/src/geometry.ts`. A fork
  wanting regions needs those two files or their like, and that reader or
  its like.
- **Bun**, for `Bun.serve` on the server side. The browser side is plain
  DOM and WebSocket.
- **`@modelcontextprotocol/sdk` 1.30 and `zod` 4**, the only runtime
  dependencies.
- **Path aliases.** The three entry points are `tsconfig.base.json` paths
  (`niivue-mcp`, `niivue-mcp/server`, `niivue-mcp/browser`) resolved by
  `vite-tsconfig-paths` in the app and by Bun in the server; the
  `package.json` `exports` map says the same for a published package.
- **A Vite proxy** for `/agent`, as above, if the page will be opened from
  a browser that allows one origin.
- **A gate on the page.** brainsonify opens the socket in development
  always and otherwise when `?agent` is in the address; a fork decides its
  own.
- **Tests** run under vitest 3 with jsdom for the browser specs and a
  spawned Bun process for the end-to-end one.
