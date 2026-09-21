# The physical knob: Elecrow CrowPanel 2.1" rotary display

The virtual controller is a keyboard. This note is what a physical knob has
to do to replace it, written before any firmware exists, so the app side is
settled and the device side has a target.

## The device

Elecrow CrowPanel 2.1" HMI ESP32-S3 rotary display. What we are going on,
from the product page:

- a 480×480 round touch display
- a knob around it that turns clockwise and counter-clockwise and presses
- BOOT and RESET buttons
- BLE 5.0 and WiFi on the ESP32-S3
- an MX1.25 connector for 5 V and programming

> _To fill in: which firmware toolchain and BLE keyboard library, once one
> has been tried on the board._

## What the app expects

The app never sees a device. It sees key presses, and one table says which
key means what: `KEY_MAP` in `apps/brainsonify/src/controllers/keys.ts`.
That table is the protocol. A device that sends these keys as a keyboard
needs no code in the browser at all.

| Gesture | Key | Intent |
|---|---|---|
| knob clockwise, one detent | `ArrowUp` | turn clockwise |
| knob counter-clockwise, one detent | `ArrowDown` | turn counter-clockwise |
| knob press | `Enter` | press: say where we are, change nothing |
| mode button | `1` `2` `3` `4` `5` | left-right, back-front, down-up, cut plane, parameter |
| next mode | `0` | cycle the mode |
| parameter buttons | `[` `]` | previous, next parameter |
| step button | `s` | cycle fine, medium, large |
| center | `Home` | center the crosshair |
| next plane | `n` | next whole plane, the cycle `c` uses |

The knob is the listener's, the buttons are the technician's. The panel has
one knob and no spare hardware buttons for the technician (BOOT and RESET are
the board's own), so the buttons are drawn on the round touch screen; a
keyboard next to the panel serves as well, since the app cannot tell the two
apart. Each detent should send exactly one key press; the app's step size is
set with `s`, not by how far the knob turns.

The keys were chosen around the ones NiiVue reads on a focused canvas (h, j,
k, l, m, c, v, u, d, left and right arrows), so a key never does two things
depending on where the focus is. Changing the table changes the protocol for
both controllers at once; `virtual.spec.ts` checks the table against
NiiVue's keys.

## Transport, in order

1. **BLE HID keyboard.** The panel pairs with the laptop as a Bluetooth
   keyboard and sends the keys above. Nothing in the browser changes. This is
   the first thing to build.
2. **Web Serial over the programming connector.** Same keys as bytes on a
   serial line. Needs a small adapter in the app (a second `Controller` next
   to the virtual one, feeding the same `ControlSurface`) and a user gesture
   to open the port. Only worth it if Bluetooth pairing turns out to be a
   problem in the room.
3. **Web Bluetooth GATT.** Only needed if the round display should mirror
   what the app says: mode, step, the focused parameter and its reading. A
   keyboard is one-way; a GATT characteristic can carry the status line back
   to the panel. The app already has that line as text (`#knobStatus`), so
   the adapter would send it on every change and nothing else.

Whichever transport, the device stays dumb: it sends gestures, the app
decides what they mean and says so. Modes, step sizes and parameter order
live in the app, and a firmware never has to know the schema.
