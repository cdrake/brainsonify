brainsonify
===========

Move the pointer over a brain scan and hear the tissue underneath.
Everything it needs is in this folder: no installing, no internet.

Use Chrome or Edge if you can (Safari works too), and wear headphones.


STARTING IT
-----------

1. Unzip the folder somewhere, for example your Desktop. Keep everything
   in it together; the program needs the "app" folder beside it.

2. Double-click the program for your computer:

     Mac with Apple silicon (M1 and later)   brainsonify-mac-apple-silicon
     Mac with an Intel processor             brainsonify-mac-intel
     Windows                                 brainsonify-windows.exe

   (Not sure which Mac you have? Apple menu > About This Mac. "Chip: Apple
   M..." means Apple silicon; "Processor: Intel" means Intel.)

3. A small terminal window opens and your browser opens brainsonify at
   http://127.0.0.1:4200/?agent. Leave the terminal window open while you
   use it. Close it to quit.

   If the browser does not open by itself, type that address into it.


THE FIRST TIME: "CAN'T BE OPENED" OR "WINDOWS PROTECTED YOUR PC"
-----------------------------------------------------------------

The program is not signed by Apple or Microsoft, so the first run is
blocked. This happens once.

  Mac: double-click the program, click Done (or Cancel) in the warning,
  then open System Settings > Privacy & Security, scroll down, and click
  "Open Anyway" next to the brainsonify message. Confirm with your
  password, then double-click the program again.

  Or, in Terminal, unblock the whole folder in one step (drag the folder
  onto the Terminal window to fill in its path):

      xattr -dr com.apple.quarantine /path/to/brainsonify

  Windows: in the blue "Windows protected your PC" box, click
  "More info", then "Run anyway".


IF SOMETHING GOES WRONG
-----------------------

"address already in use" in the terminal window: brainsonify is already
running in another window, or another program is using port 4200 or 4242.
Close the other window and try again.

No sound: click "Enable sound" (or "Start session") in the page. Browsers
only play sound after a click.


LETTING AN AI AGENT DRIVE IT
----------------------------

While it runs, an MCP server is listening at http://127.0.0.1:4242/mcp.
With Claude Code, for example:

    claude mcp add --transport http niivue http://127.0.0.1:4242/mcp

Keep the brainsonify browser tab in front while the agent works.
