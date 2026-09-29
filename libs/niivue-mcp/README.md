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

startServer({ name: "my-niivue-app", version: "0.1.0", pageUrl: "http://localhost:8080/" });
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
console, `pageUrl` so `new_tab` can hand out the address that opens the
page as a named tab, `instructions` for what an agent reads when it
connects (what the page shows and can fetch, which the tools cannot know),
and `bridge` for the bridge's options: `noTabHint` is
appended to the message a call fails with while no tab is connected, so the
agent is told how to open your page (brainsonify's says to open it with
`?agent`).

Loopback keeps the network out but not other web pages: any site open in
the same browser can ask it to open a socket to `127.0.0.1`, and a hostname
an attacker controls can resolve there. So `/app` refuses a page whose
`Origin` is not loopback (`localhost`, `127.0.0.1` or `[::1]` on any port; a
client that sends no `Origin`, which is not a browser, is let in), and
`/mcp` refuses a request whose `Host` header does not name this server. A
page served from elsewhere goes in `allowedOrigins`; a name for the server
other than loopback goes in `allowedHosts`, with its port:

```ts
startServer({
  allowedOrigins: ["https://viewer.example.org"],
  allowedHosts: ["niivue.local:4242"],
});
```

Calls to one tab go one at a time, in the order they were made. The page's
handlers all change the one scene, so an agent that fires several tools
together gets each answered against the scene the one before left rather
than racing them.

## Tabs

Every page that connects says hello with an id, a title, its address and
its state, and the server welcomes it with the id it will list the tab
under. The id is kept in the tab's `sessionStorage`, which a browser
scopes to one tab and keeps across reloads, so a reload arrives as the
same id on a new socket and a second tab arrives as a new id. A
duplicated tab is the exception: the browser copies its `sessionStorage`,
so the copy arrives with the original's id while the original is still
connected. The bridge keeps the original as it is and welcomes the copy
with a spare id, the original's with `-2` on the end, which the copy
keeps for its own reloads; both are then listed, and a call with neither
chosen asks, as with any two tabs.

A page opened with `?tab=<id>` in its address takes that id instead, and
keeps it in `sessionStorage` too, so its reloads and a later address
without the parameter still arrive as it. That is how an agent names a
tab before it exists: `new_tab` makes up a UUID and returns it with the
address to open, the person opens it, and every later call in the
conversation passes the id as `tab` and reaches that tab whatever else is
connected or chosen. An agent may make up any id itself and put it in the
address the same way; `new_tab` only spares it the guessing and knows
where the page is. A duplicate of such a tab is renamed by the server as
any duplicate is, and keeps the spare id across its own reloads although
its address still names the original.

Which tab answers a call:

- **The call names a `tab`**: that one, if it is connected, else the call
  fails and lists the tabs. The choice made with `use_tab` is left as it
  was.
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
  said once. A page that comes back on a new socket without reloading,
  after the server restarted or the socket dropped, says so in its hello
  and gets no note, since its scene is as it was.
- **No tab connected**: the call fails with a message saying what to open.

Every answer carries `tab: {id, title}` in `where_am_i`, and `list_tabs`
marks the one that is answering.

## The core tools

| Tool | Input | What it does |
|---|---|---|
| `list_tabs` | | The connected tabs: id, title, address, when each connected and which one answers |
| `use_tab` | `id` | Makes one tab the one that answers every later call |
| `new_tab` | | Makes up an id for a tab that is not open yet and gives the address that opens the page as that tab, `pageUrl` with `?tab=<id>` on it |
| `load_volume` | `url`, `name?`, `colormap?`, `mni?` | Loads a volume from an address the page can fetch, replacing what is shown. `mni` says whether the atlas applies; guessed from the name when left out. Reports the name and the volume's bounds in millimetres |
| `add_overlay` | `url`, `name?`, `labels?`, `colormap?`, `opacity?` | Draws another volume over whatever the page shows, keeping it, whether the page opened with it or `load_volume` brought it. `labels: freesurfer` draws a segmentation (FreeSurfer or SynthSeg ids) with FreeSurfer's names and colours, and `labels` as the address of a label table JSON (`R`, `G`, `B` and `labels` arrays, as NiiVue reads them) draws any other atlas with its own; otherwise a colormap. A new `load_volume` clears the overlays |
| `where_am_i` | | The crosshair in millimetres and fractions, the volumes shown and how each is drawn, the plane cut, the camera, the view layout, the page's description of the place, and whatever state the app adds. Says which tab answered |
| `list_regions` | `query?` | The atlas regions the page can navigate to: label, spoken name, centroid in millimetres, voxel count. `query` filters by label or name |
| `go_to_region` | `region`, `plane?` | Moves the crosshair to a region's centroid, turns the camera to face the cut, cuts a plane through the point, and announces the place. `plane` is a side, a slice name or `current`. An ambiguous name fails and lists the candidates |
| `go_to_point` | `mm?`, `vox?`, `plane?`, `label?` | Moves the crosshair to a point in the volume's world millimetres, or to a voxel of the base volume, cuts a plane through it facing the camera, and announces it, prefixed with `label` when given. The same move as `go_to_region`, for any space |
| `set_clip_plane` | `plane?`, `depth?`, `azimuth?`, `elevation?`, `index?`, `planes?`, `face?` | Cuts the volume with a whole plane named for the side it takes off, or `off`; or at any `azimuth` and `elevation`; or several planes at once with `planes`, each `[depth, azimuth, elevation]`. `depth` is NiiVue's, clamped to plus or minus 1.5; `index` picks one of the six planes; `face` turns the camera to look at the cut, on by default |
| `set_camera` | `azimuth?`, `elevation?`, `pan_2d?`, `render_pan?`, `pivot?`, `center_on?`, `global?` | Points the render camera, pans the slices (`pan_2d`, NiiVue's `[x, y, z, zoom]`) or the render, sets or clears the point the render turns about, centres the render on a point in millimetres, or places the camera outright with `global` (`position`, `yaw`, `pitch`, `fov`, `near`, `far`). Only what is given changes |
| `set_volume` | `volume?`, `colormap?`, `colormap_negative?`, `opacity?`, `cal_min?`, `cal_max?`, `cal_min_neg?`, `cal_max_neg?`, `colormap_type?`, `transparent_below_cal_min?`, `frame?`, `invert?`, `colorbar?`, `nearest?`, `atlas_outline?`, `modulate_alpha?`, `labels?`, `modulate?`, `load_all_frames?`, `auto_window?`, `affine?`, `reset_affine?`, `transform?`, `chunk_grid?`, `spread?` | Changes how one loaded volume is drawn, leaving the rest: the colormaps for positive and negative values, the opacity, the display windows, how the window is drawn below its minimum, the frame of a 4D volume, an inverted colormap, its colorbar, nearest-neighbour sampling, an atlas outline, a label table (`labels`, as `add_overlay` takes it), modulation by another volume, loading every frame of a deferred 4D volume, a recomputed window, its voxel-to-world affine set outright or reset, or a translation, rotation and scale applied to it, or its tiling into bricks and how far they are spread apart in the 3D render (`spread`, an exploded view; a volume not yet chunked is tiled 3 by 3 by 3 first). `volume` is an index as `where_am_i` lists them or a name; the base otherwise. Reports the volume as drawn now, with `chunkGrid` and `spread` when it is tiled |
| `set_labels` | `labels?`, `dim_others?`, `clear?` | Draws text labels tied by a line to a point each: an atlas region (its centroid, its spoken name as the text unless `text` is given) or a point in `mm` with its own `text`. On a volume tiled into bricks each label outlines the brick holding its point (the page gets the corners as `boxMM`), and `dim_others` sets the opacity of the bricks holding no label. Each call replaces the labels before it, and the dimming; `clear` takes them down. Needs the page's `labels` hook; a page without one declines |
| `set_view` | `slice?`, `layout?`, `mosaic?`, `show_render?`, `radiological?`, `colorbar?` | Sets what the canvas shows: one slice orientation, all three with the render (`multiplanar`), or the render alone; how the multiplanar tiles are arranged and whether the render tile joins them; a NiiVue mosaic string; radiological convention; the colorbar. Only what is given changes. Reports the whole layout |
| `screenshot` | `max_width?` | Draws the scene and returns the canvas as a PNG, scaled down to fit. On a volume tiled into bricks it waits for every brick to arrive first, so the picture is never a part of the volume. Refuses while the tab is in the background, where the browser draws nothing |

Every tool below `new_tab` also takes `tab?`, the id of the tab to ask;
without it the answering tab is asked, as the Tabs section explains.

Every reply is a line of prose for the agent to read, then the JSON the
page returned. Failures are tool errors with the page's own message.

### More on volumes

| Tool | Input | What it does |
|---|---|---|
| `nudge_crosshair` | `vox` | Steps the crosshair a whole number of voxels along each of the base volume's axes and reports where it lands |
| `transform_volume` | `name`, `volume?`, `options?`, `replace?` | Runs one of NiiVue's registered volume transforms (`capabilities` lists them with their options) on a loaded volume and adds the result on top of the stack, removing the source when `replace` is set |
| `remove_volume` | `volume?`, `all?` | Unloads one volume, or every volume with `all`. Reports the volumes that remain |
| `reorder_volume` | `volume`, `move` | Moves a volume `up`, `down`, to the `top` or to the `bottom` of the stack. The bottom volume is the base that sets the space |
| `describe_volume` | `volume?`, `stats?`, `mask?`, `mask_labels?`, `drawing?`, `affine?` | One volume in full: how it is drawn, its dimensions, its label table, its voxel statistics (over the whole volume, within a mask volume, its labels, or the drawing), and its affine when asked |

### Settings and capabilities

| Tool | Input | What it does |
|---|---|---|
| `get_options` | `names?`, `describe?` | Reads NiiVue's settings by their own names: crosshair, colours, fonts, 3D rendering, drawing pen, drag behaviour and the rest. Without `names` it describes every setting the page has, with its kind, its choices or bounds and what it does |
| `set_options` | `options` | Changes any of those settings, several at once. A choice is given by its word (a drag mode, a pen shape, a render mode), a colour as `[r, g, b, a]` 0 to 1. Every value is checked before any is set |
| `capabilities` | | What this page's NiiVue offers: its backend, which tool features it supports by group, which settings it has, its colormaps, drawing colormaps and mesh shaders, its volume transforms with their options, and the file types it reads and writes. A page whose NiiVue lacks a feature refuses that tool in words and answers every other |
| `add_colormap` | `name?`, `R?`, `G?`, `B?`, `A?`, `I?`, `labels?`, `url?` | Adds a colormap from its stops, or fetches one from an address as a NiiVue colormap JSON |
| `set_font` | `atlas`, `metrics` | Loads the font NiiVue draws its text with, from an atlas PNG and a metrics JSON |
| `set_custom_layout` | `tiles?`, `clear?` | Places tiles on the canvas by hand, each a slice orientation or the render at `[left, top, width, height]` as fractions, in place of the ordinary layout; `clear` goes back to it |

### Meshes

| Tool | Input | What it does |
|---|---|---|
| `load_mesh` | `url`, `name?`, `replace?`, `opacity?`, `color?`, `shader?`, `slice_shader?`, `visible?`, `colorbar?`, `legend?`, `layers?` | Loads a surface, tract or connectome over the volumes, with overlay layers when given; `replace` drops the meshes shown once it has loaded |
| `list_meshes` | | The meshes shown, each with how it is drawn and its layers, and the shaders the page knows |
| `set_mesh` | `mesh?`, `name?`, `opacity?`, `color?`, `shader?`, `slice_shader?`, `visible?`, `colorbar?`, `legend?`, `tract?`, `connectome?` | Changes how a mesh is drawn, leaving the rest; `tract` and `connectome` take NiiVue's option objects for those kinds and report a tract's groups |
| `remove_mesh` | `mesh?`, `all?` | Unloads one mesh, or every mesh |
| `add_mesh_layer` | `url`, `mesh?`, `name?`, `colormap?`, `colormap_negative?`, `cal_min?`, `cal_max?`, `cal_min_neg?`, `cal_max_neg?`, `opacity?`, `colorbar?`, `invert?`, `transparent_below_cal_min?`, `additive?`, `outline_width?` | Draws a per-vertex overlay (a curvature, a thickness, a statistic) on a mesh |
| `set_mesh_layer` | `mesh?`, `layer?`, the layer fields above, `frame?` | Changes how a layer is drawn, or the frame of a 4D layer |
| `remove_mesh_layer` | `mesh?`, `layer?` | Takes a layer off a mesh |

### Signals and the graph

| Tool | Input | What it does |
|---|---|---|
| `load_signal` | `url`, `name?`, `replace?`, `as_signal?`, `display?`, `attach_to?`, `annotations?` | Loads a physiological trace or a spectroscopy voxel for the graph, drawn as `display` says (`mode`, `ppm_range`, `ppm_ref`, `use_hz`, `apodize_hz`, `phase0`, `phase1_ms`, `columns`, `average`, `legend`), attached to a volume, with notes on the graph |
| `list_signals` | | The signals shown and the graph's range |
| `set_signal` | `signal?`, `display?`, `attach_to?`, `annotations?` | Changes how a signal is drawn, what it is attached to, or its notes |
| `remove_signal` | `signal?`, `all?` | Unloads one signal, or every signal |
| `set_graph` | `cursor?`, `step?`, `zoom?`, `pan?`, `range?`, `reset?` | Moves the graph cursor to a fraction or steps it, zooms and pans the graph, windows its range or clears the window, or resets the view |

### The drawing, annotations and measurements

| Tool | Input | What it does |
|---|---|---|
| `edit_drawing` | `action`, `url?`, `slice?`, `slice_index?` | Works on the voxel drawing over the base volume: `create` an empty one, `load` one from an address, `undo` the last stroke, `close` it, or trace a slice of it as `svg`. Strokes are made by hand on the page; the pen settings are in `set_options` |
| `list_annotations` | `polygons?`, `json?`, `svg?`, `slice?`, `slice_position?` | The vector annotations drawn on the slices, with their polygons, as JSON, or traced as SVG when asked |
| `edit_annotations` | `action`, `id?`, `text?`, `annotation?`, `json?` | `add` a NiiVue VectorAnnotation, `remove` or `select` one by id, `set_text` on one, `clear` them, `undo`, `redo`, or `load` a set from JSON |
| `list_measurements` | | The distance measurements drawn on the slices, each with its ends in millimetres and its length |
| `edit_measurements` | `action`, `start_mm?`, `end_mm?`, `slice?`, `slice_index?`, `slice_position?`, `index?` | `add` a distance between two points, `remove` one by index, or `clear` them all, the angles (`clear_angles`) or the distances (`clear_distances`) |

### The canvas, the slide plane, chunks and files

| Tool | Input | What it does |
|---|---|---|
| `set_viewport` | `pan?`, `zoom?`, `bounds?`, `reset?` | Pans and zooms the canvas in 2D, bounds where NiiVue draws to a box of fractions (or `null` to clear it), or resets |
| `map_point` | `canvas?`, `mm?`, `vox?` | What is under a canvas pixel (the tile, the slice, the point in millimetres), or where a point in millimetres or a voxel lands on the canvas |
| `set_slide` | `level?`, `clear_plane?`, `drawing?`, `max_raster?` | For a whole-slide image: the level the slide plane shows (or `null` for automatic), clearing the plane, and the slide drawing (`create`, `clear`, `undo`, `end`) |
| `chunk_stats` | `rebake?`, `reset_timing?` | For a chunked (OME-Zarr, IIIF) volume: the streaming, timing and level-of-detail statistics; rebakes the chunked overlays or resets the timing when asked |
| `save` | `what`, `filename?`, `volume?`, `drawing?`, `mesh?`, `quality?`, `format?`, `settings_never_saved?`, `settings_always_saved?` | Has the browser download the scene as a NiiVue document, a volume (with the drawing when asked), a mesh, the canvas as a picture, or the drawing |
| `load_document` | `url`, `fill?` | Loads a NiiVue document from an address, replacing the scene; `fill` says whether settings the document leaves out take their defaults or stay as they are |

What is left out is what an MCP tool cannot carry: the members of NiiVue that take a DOM node, a canvas, a `File`, a callback or another object rather than a value. Attaching to a canvas, resizing, the draw and refresh methods, the event listeners, loaders and custom overlay renderers are registered by the page (so are volume transforms, but once registered they take a name and options, so `transform_volume` runs them and `capabilities` lists them); pointer-driven picking (`slideDrawAt`, `slidePlanePick`, `pickMeasurement`, `pickExplodedBlock`) belongs to the pointer; `loadChunkedVolume`, `setSlidePlane`, `swapVolumeChunkPlan` and `addMrsiSignal` take live source objects a page builds; `setFont` takes decoded font data, so `set_font` takes the addresses instead; `broadcastTo` and `setInstances` link instances on one page, which the page does. Every one of those is a page concern, not a scene state, and the page an agent drives is free to expose any of them through its own extension tools.

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
  labels: (labels) => pins.setLabels(labels), // optional: draws set_labels' labels, an empty list clears
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
at half a minute, so the order the two are started in does not matter. An
address that neither opens nor refuses within `CONNECT_MS` (five seconds)
is closed and the next one tried, so a proxy that takes the upgrade and
hangs does not hold the page off the server behind it.

The client should be attached before the page awaits NiiVue. A tab in the
background gets no animation frames, so `attachTo` and a first
`loadVolumes` do not finish until it is brought to the front; a client
attached only after them is invisible to the server until then. Attach
first and have the handlers say "still starting" until the scene is ready.

**3. Add your own tools, if any.** Extra handlers are just more entries in
the object passed to `AgentClient`; they receive the tool's arguments and
return the JSON the agent sees, or throw to fail the call. Add their state
to what the `state` callback returns and the reload note will cover it.

**4. Register them on the server.** An `Extension` is a name and a
`register(server, context)` that calls `server.registerTool` for each
tool, answering through `context.answer(method, params, options)`, which
forwards to the bound tab, or to the one `options.tab` names, and wraps
the reply. Spread `TAB_ARG` into the tool's schema so an agent can name
the tab for it as it does for the core tools, and pass the value on as
`options.tab`. Pass the extension to `startServer`:

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
  interface in `browser/view.ts` lists exactly what is used, member by
  member. Twelve are required: `canvas`, `volumes`, `azimuth`,
  `elevation`, `crosshairPos`, `getCrosshairPos`,
  `getClipPlaneDepthAziElev`, `setClipPlane`, `loadVolumes`, `addVolume`,
  `drawScene` and `model.mm2scene` / `scene2mm`. Every other member
  (meshes, signals, the drawing, the settings, the slide plane, chunked
  volumes, documents) is optional, and a tool whose members the page's
  NiiVue lacks refuses in words while every other tool answers.
  `crosshairPos` is a gl-matrix `vec3`, hence the loose `Triple` type. A
  NiiVue that keeps those names works without changes to the core.
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
