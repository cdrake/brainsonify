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
— the numbered switcher runs 01 (pitch only) through 10 (adds the radar
sweep). Higher numbers layer on more channels; if this is someone's first
session, start low and add channels across a few passes rather than opening
on 10.

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
cuts and then off, in this exact order, and wraps back to the start:

1. Left — hides the right hemisphere, shows the left
2. Right — hides the left hemisphere, shows the right
3. Posterior — hides the front, shows the back (this is the starting cut, so pressing `c` for the first time in a session moves past it, not onto it)
4. Anterior — hides the back, shows the front
5. Inferior — hides the top, shows the underside
6. Superior — hides the bottom, shows the top
7. Off — nothing clipped, the whole head/brain visible
8. back to Left, and the cycle repeats

Every one of these opens already sitting at its own midline (`c` always
lands you back at depth zero on the new axis), so after a `c` press the
listener is hearing the same kind of "start at the center" cut as the
session opened on, just along a different axis. Narrate the switch out
loud — "I'm cutting from the top now" — since it's the one thing about the
scene the listener has no other way to know just changed.

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

On experiment 10 there is a **Start radar sweep** button under **Crosshair
position**. Press it and the app reads the cut face by itself: left to right
along one line, then the next line down, and back to the top after the
bottom, until you press it again. The mouse is ignored while it runs, so
you can take your hand off it. The crosshair follows the sweep on every
tile, and the magenta line grows from the left as each line is read — that
is where the sound is coming from right now.

The sweep reads whatever plane is currently cut, so the wheel and `c` still
work while it runs, and the sweep goes with the plane. Say so when you move
it: "same sweep, one cut deeper now."

Tell the listener when a new line starts near the top, and roughly how far
down the face the sweep is from time to time — a whole face takes over a
minute, and there is nothing in the sound that says which line this is.

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
