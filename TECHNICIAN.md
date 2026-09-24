# Running a session: a guide for the sighted technician

This app is built to be heard, not watched — but someone with vision still has
to drive the screen. This is that person's guide: what to click before the
listener puts headphones on, how to move the cut plane during a session, and
what to say out loud while you do it.

You do not need to understand the sonification mapping in depth to run a
session well. You do need to know what the controls do and what the listener
cannot see for themselves, which is everything visual: labels, buttons,
where the plane currently is, and when something has finished loading.

## Before the listener sits down

Load the scan (a demo button, or drop a `.nii` / `.nii.gz` file on the page)
and pick the **Experiment** at the top that matches what you're demonstrating
— the numbered switcher runs 01 (pitch only) through 11 (the radar sweep
at a fast pace). Higher numbers layer on more channels; if this is
someone's first session, start low and add channels across a few passes
rather than opening on 11.

Click **Enable sound** yourself before handing over headphones — most
browsers block audio until a real click happens, and that click should be
yours, not something the listener has to guess at. Enabling sound plays the
**sound key** once automatically: a spoken, then sounded, walk-through of
each active channel. Let it finish before the listener starts exploring, and
use the **Sound key** button to replay it any time the mapping needs
re-explaining, or after you switch experiments (the key demonstrates whatever
channels are on right now, so it changes with the condition).

Put headphones on the listener before they start, not partway through —
the stereo left/right field is one of the channels, and it only reads
correctly with two ears.

## Getting oriented on screen

The scan opens already cut to the **medial slice of the coronal plane**: the
plane straight down the middle, front from back, at the midline. That's the
starting point every session begins from, so you don't have to set it up by
hand.

The screen shows four tiles: three flat slices and the 3D render, which
is where the cut face is. They rearrange to fit the window — side by side
when it is wide, stacked when it is tall, two by two otherwise — so the
render is not always bottom right, but it is always there. If a listener's
setup is a wide, short window, expect it to be the rightmost tile.

The render is a `<canvas>`, and browsers only send it keyboard shortcuts
once you've clicked it — **click once on the 3D render before you try `c`
or arrow keys.** The mouse wheel does not need that click; it works as soon
as you're hovering the render, click or no click. If `c` seems to do
nothing, this is almost always why — click the image and try again.

## Moving the cut plane

Two native controls move the plane NiiVue is already showing. Neither one
is the **Clip** slider in the side panel — that's a separate, older control
in this app for pulling the near surface out of the pointer's way, and it
tracks wherever the 3D camera is currently pointed rather than a fixed
anatomical plane. For presenting slice by slice, use the wheel and `c`
below; leave Clip alone unless you specifically need to reach past a render
angle in that panel's own workflow.

**Scroll the mouse wheel while hovering the 3D render** to slide the plane
deeper or shallower along whichever axis it's currently cut on. This is the
fine control — small, continuous moves, good for "a little further" during
a hover.

**Press `c`** to jump to the next whole plane. It cycles through six fixed
cuts and then off, in this exact order, and wraps back to the start. Each
is named for the side it takes off, and the 3D render turns to look at the
cut from that side, so the face is what you see and what the pointer reads:

1. Posterior — takes off the back, faced from behind (this is the starting cut, so pressing `c` for the first time in a session moves past it, not onto it)
2. Right — takes off the right hemisphere, faced from the right
3. Left — takes off the left hemisphere, faced from the left
4. Anterior — takes off the front, faced from the front
5. Inferior — takes off the underside, faced from below
6. Superior — takes off the top, faced from above
7. Off — nothing clipped, the whole head/brain visible; the camera stays where it was
8. back to Posterior, and the cycle repeats

The knob's next plane (`n`) walks the same ring and turns the camera the
same way. If you have dragged the render to some other angle, the next
whole plane snaps it back to face the cut.

Every one of these opens already sitting at its own midline (`c` always
lands you back at depth zero on the new axis), so after a `c` press the
listener is hearing the same kind of "start at the center" cut as the
session opened on, just along a different axis. The app says the new plane
out loud while sound is on ("Cut plane: superior."), and a `v` press says
the new view the same way, so the listener hears that something changed.
What it means for them is still yours to add: "we're looking down from the
top now."

## Presenting a region

Once the plane is where you want it, move the pointer slowly across the
exposed surface. Every voxel under the pointer sounds as you cross it, so
speed matters: a fast pass blurs everything into a glissando, a slow
deliberate pass lets each region register as its own sound. Pause on
anything worth dwelling on — the sonification keeps sounding a held voxel,
so a pause is audible as a held tone, not silence.

Say where you are in anatomical terms as you move — "moving toward the
back now," "this is close to the midline," "we're near the top" — even
though the readout panel already prints pan/depth/height numbers on
screen. The listener cannot see that panel; your narration is their only
access to it. Reading a raw number off the panel out loud ("depth: A 40%")
is also fine and sometimes clearer than a description, especially once a
listener has learned the convention.

If the mouse overshoots or you lose track of where you are, the crosshair
buttons under **Crosshair position** step by a fixed amount (Fine 1%,
Medium 5%, Large 10%) and **Center** always returns to the exact midpoint
of the volume — a reliable "home" to return to and re-orient from between
passes. Arrow keys repeat the same moves once you've clicked into that
button group once.

## Letting the sweep do the moving

On experiments 10 and 11 there is a **Start radar sweep** button under
**Crosshair position**. Press it and the app reads the cut face by itself: left to right
along one line, then the next line down, and back to the top after the
bottom, until you press it again. The mouse is ignored while it runs, so
you can take your hand off it. The crosshair follows the sweep on every
tile, and the magenta line grows from the left as each line is read — that
is where the sound is coming from right now.

The sweep reads whatever plane is currently cut, so the wheel and `c` still
work while it runs, and the sweep goes with the plane. Say so when you move
it: "same sweep, one cut deeper now."

The sweep runs on the browser's animation frames, and browsers stop those
for a tab that is not on screen. Keep the tab in front while it runs; if
you switch to another window, the sweep stops where it is and picks up
again when you come back.

Tell the listener when a new line starts near the top, and roughly how far
down the face the sweep is from time to time — on 10 a whole face takes
over a minute, and there is nothing in the sound that says which line this
is. The three sliders under the button (Line, Lines, Rest) set the pace;
10 opens slow with no gap between lines, 11 opens at half a second a line
with a short silence after each. Move them if a listener asks for slower
or faster, and say what you changed. **Lines run** picks which way each
line is read: left to right, right to left, top to bottom, or bottom to
top. Say which way the lines now run, since the sound alone does not.

## The knob

The knob is the listener's; its buttons are yours. Until the rotary panel
arrives, the knob is the keyboard: `↑` and `↓` turn it, `Enter` presses it,
and the number keys and a few letters are the buttons. The panel will send
these same keys over Bluetooth, so nothing in this section changes when it
does.

What a turn does depends on the mode, and the mode is yours to set:

- `1` moves the crosshair left and right, `2` back and front, `3` down and up
- `4` slides the cut plane along its own axis — the same move as the wheel
  over the render — and says "No plane is cut" if there is nothing to slide
- `5` sets a panel parameter; `[` and `]` pick which one, in the panel's own
  top-to-bottom order
- `0` steps to the next mode when the numbers are out of reach
- `s` cycles the step size: fine, medium, large
- `Home` centers the crosshair; `n` jumps to the next whole plane, the same
  cycle as `c`, and the two stay in step

Every one of those is said out loud while sound is on — "Knob moves the cut
plane." — so you don't have to announce the change itself, but you should
still say why: "I'm handing you the cut plane now, turn it to go deeper."
Turning a slider value with the knob is silent, the sound is the feedback;
switching an on/off or a list setting is spoken.

Pressing the knob changes nothing. It says where the crosshair is — region
first on an MNI scan, then left/right, front/back and height — or, in
parameter mode, what that parameter reads. Tell the listener that up front:
it is the one thing they can do freely, whenever they lose track, without
undoing anything.

The keys work from anywhere on the page except inside a slider, list or
button, so click on empty space before handing over. The **Knob:** line
under the crosshair buttons shows what the knob does right now, its step
size, and the focused parameter's value; glance at it when a listener asks
what turning will do. The step-size select beside the crosshair buttons is
for those buttons only; the knob's step size is set with `s`.

## Letting an agent drive

An agent connected over MCP can do the region step for you: `go_to_region`
puts the crosshair on a region's centroid, cuts a plane through it so the
region is on the exposed face, turns the render to look at that face from
the side the cut took off, sounds the voxel there and announces the
place the way the knob does. For that to work the app must be open with
`?agent` in its address (the dev server does it without), the MCP server
must be running (`bun run mcp`), and the scan must be the MNI152 demo or
another MNI-space volume. The line under the crosshair buttons says whether
the server was reached.

Warn the listener before an agent moves them, the same as you would before
moving them yourself: the announcement says where they are now, not that
something is about to happen. An agent keeps the plane you have cut unless
it asks for another, so set the orientation first if it matters, and leave
the **Clip** slider at zero while an agent is driving, since above zero a
camera turn re-cuts the plane the slider's way. `where_am_i` is the agent's
version of pressing the knob and changes nothing.

## Quick troubleshooting

No sound at all: check **Enable sound** actually shows "Sound on" (it
toggles state and color when active); a muted system volume or a browser
tab that never got a user gesture are the other two usual causes.

`c` does nothing: click the 3D render once first (see above), then try
again.

The listener says everything sounds the same: you're probably moving too
fast, or the **Gate** control is set high enough that only the loudest
voxels are making it through — check the readout panel's norm value while
you hover to see whether it's clearing the gate at all.

The region name is missing or says "off: not an MNI scan": the atlas only
labels scans that are already in MNI space, like the MNI152 demo. A
whole-head or individually scanned volume won't have region names, which
is expected, not a bug — everything else still works.

The line under the crosshair buttons says "agent server not reached": start
the server with `bun run mcp` if it isn't running; the app keeps retrying on
its own and the line changes when it gets through. The browser console has
one line naming the addresses it tried. If the line says connected but an
agent's call moves nothing on screen, another open tab of the app answered
instead — the newest tab to connect is the one that answers — so reload the
tab you're watching.
