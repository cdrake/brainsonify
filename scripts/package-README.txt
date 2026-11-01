brainsonify
===========

Move through a brain scan and hear the tissue underneath. Steer it with
the on-screen Virtual Helm, or let an AI agent (Claude Code, Codex,
Gemini CLI, ...) drive it through its MCP server.

Everything it needs is in this folder: no installing, no internet.
Use Chrome or Edge if you can (Safari works too), and wear headphones.


1. START IT
-----------

1. Unzip the folder somewhere, for example your Desktop. Keep everything
   in it together; the program needs the "app" folder beside it.

2. Double-click the program for your computer:

     Mac with Apple silicon (M1 and later)   brainsonify-mac-apple-silicon
     Mac with an Intel processor             brainsonify-mac-intel
     Windows                                 brainsonify-windows.exe

   (Not sure which Mac you have? Apple menu > About This Mac. "Chip: Apple
   M..." means Apple silicon; "Processor: Intel" means Intel.)

3. A terminal window opens and shows:

     brainsonify is running at http://127.0.0.1:4200/?agent&helm=1
     Agents connect to http://127.0.0.1:4242/mcp

   and your browser opens the site. Leave the terminal window open the
   whole time; closing it quits brainsonify. If the browser does not open
   by itself, type http://127.0.0.1:4200/?agent&helm=1 into it.

The first time only, macOS or Windows blocks the program because it is
not signed:

  Mac: double-click the program, click Done (or Cancel) in the warning,
  then open System Settings > Privacy & Security, scroll down, and click
  "Open Anyway" next to the brainsonify message. Confirm with your
  password, then double-click the program again.

  Or, in Terminal, unblock the whole folder in one step (type the first
  part, then drag the brainsonify folder onto the Terminal window to fill
  in its path, and press Return):

      xattr -dr com.apple.quarantine /path/to/brainsonify

  Windows: in the blue "Windows protected your PC" box, click
  "More info", then "Run anyway". If Windows Firewall asks, allow it on
  private networks (it only listens on this computer).


2. USE THE SITE WITH THE VIRTUAL HELM
-------------------------------------

1. The page opens with a "Starting a session" box. Either follow its five
   steps and click "Start session", or click "Skip, set up from the panel"
   and click "Load MNI152 demo" in the panel on the right.

2. Click "Enable sound" in the panel. Browsers only play sound after a
   click.

3. The Virtual Helm is the small "Helm" window at the top left. (If it is
   not there, click "Virtual Helm" in the panel; click it again, or the x,
   to hide it.) Drag its title bar to move it.

     The dial    Drag around the ring, or scroll the mouse wheel over it,
                 to turn. Scrolling up turns clockwise. Each turn moves the
                 position (or changes a setting) one step.
     Press       The button in the middle says where you are.
     Buttons     Choose what turning does:
                   Left / right, Back / front, Down / up   move that way
                   Cut plane      move the cut through the 3D view
                   Parameter      adjust the selected sound setting
                   Prev / Next param   pick which setting
                   Next mode      step through all the modes
                   Step size      small, medium or large steps
                   Center         go back to the middle
                   Next plane     switch the cut plane
                 The line at the bottom of the window says what the dial
                 does now.

   The keyboard does the same: Up / Down arrows turn, Enter presses, and
   1 2 3 4 5 0 [ ] s Home n are the buttons, in the order above. The small
   gray key on each button shows its key.

4. "Helm tutorial" in the panel speaks you through every control.


3. CONNECT AN AI AGENT
----------------------

While brainsonify runs, it has an MCP server (Streamable HTTP) at

    http://127.0.0.1:4242/mcp

The agent drives the brainsonify page that is open in your browser, so
keep brainsonify running and its tab open. Run ONE of these in a
terminal, once; it stays set up for next time.

  Claude Code
      claude mcp add --scope user --transport http niivue http://127.0.0.1:4242/mcp

  Codex CLI
      codex mcp add niivue --url http://127.0.0.1:4242/mcp

  Gemini CLI
      gemini mcp add --scope user --transport http niivue http://127.0.0.1:4242/mcp

      Gemini turns MCP servers off in folders it does not trust. Start
      gemini in your own folder and answer "trust" when it asks, or
      "gemini mcp list" shows niivue as Disabled.

  Anything else that speaks MCP over Streamable HTTP (Cursor, VS Code,
  ...): add a server named "niivue" with the URL
  http://127.0.0.1:4242/mcp. In a JSON config that usually looks like

      { "mcpServers": { "niivue": { "url": "http://127.0.0.1:4242/mcp" } } }

  (Check your tool's own docs for the exact field names.)

Then start the agent (claude, codex or gemini) and check that it sees the
server: type /mcp inside it, or run "claude mcp list" or
"gemini mcp list", which should say Connected. Ask it something like:

    Use the niivue tools: load the MNI152 template, take me to the left
    hippocampus, and tell me where the crosshair is.

If the agent says no page is connected, reload the brainsonify tab (the
address must contain ?agent) and ask again.

To remove it later:  claude mcp remove --scope user niivue
                     codex mcp remove niivue
                     gemini mcp remove --scope user niivue


IF SOMETHING GOES WRONG
-----------------------

"address already in use" in the terminal window: brainsonify is already
running in another window, or another program is using port 4200 or 4242.
Close the other window and try again.

No sound: click "Enable sound" in the panel, and check the volume slider
in the panel and your computer's volume.

The Helm does nothing: close the "Starting a session" box first (Start
session or Skip); while it is open the rest of the page is paused.
