---
name: android-emulator
description: Control and interact with Android emulator via the andy CLI — launch apps, tap UI elements, take screenshots, and read accessibility trees.
---

# Andy - android automation

- Andy is a CLI for controlling and viewing android apps.
- Use Andy to verify your work.
- Screens are auto-created with defaults (1080x1920, 240dpi).

## Quick start

```bash
# Launch app and verify
andy launch && andy a11y && andy screenshot /tmp/s.png
# Use Read tool on screenshot only if a11y is ambiguous or visual verification needed.

# Tap by text and verify
andy tap "Get started" && andy a11y && andy screenshot /tmp/s.png

# Tap unlabeled element by coordinates (from a11y bounds)
andy tap 945,80 && andy a11y && andy screenshot /tmp/s.png

# Scroll down to find more elements
andy swipe 540 1400 540 400 && andy a11y && andy screenshot /tmp/s.png

# Dismiss dialog and go back
andy key 4 && andy a11y && andy screenshot /tmp/s.png
```

## Workflow tips

- **screenshot and a11y auto-wait for idle.** You do NOT need `wait-for-idle` or `sleep` before them — auto-wait is more efficient than fixed sleeps. They print `note: waited Xms for idle` when they wait.
- **Chain commands with `&&`** for tap-then-verify workflows: `andy tap "OK" && andy screenshot /tmp/s.png`
- **Always check `a11y` on unfamiliar screens** before tapping by text. Many elements (tab bars, icon buttons, header icons) have NO text labels and require coordinate taps.
- **a11y bounds are `(left,top,right,bottom)`**. To tap center: `((left+right)/2, (top+bottom)/2)`.
- **When to read screenshots vs rely on a11y:**
  - **Navigate/automate** → a11y only (save tokens)
  - **Verify/check/test a flow** → ALWAYS read screenshots at each step
  - **Verify a non-UI bug fix** → a11y only is fine
  - **Created/modified UI** → ALWAYS read screenshots to check layout and styling
- **`tap "text"` errors if text is not in the a11y tree.** It does NOT do fuzzy matching. Use exact text from a11y output.
- **Andy runs in a sandbox.** Explore freely.
- **Overlays/bottom sheets hide elements underneath** from the a11y tree. Dismiss them first (tap or key 4 BACK).
- **Key 4 (BACK)** is essential: dismisses dialogs, closes overlays, navigates back.
- **Scroll with swipe.** Elements off-screen won't appear in a11y. Swipe to scroll: `andy swipe 540 1400 540 400` (scroll down) or `andy swipe 540 400 540 1400` (scroll up). Screen is 1080x1920.

## Reference

```bash
andy info                        # screen info (JSON)
andy screenshot [--no-wait] /tmp/s.png  # save screenshot (auto-waits for idle)
andy a11y [--no-wait]            # human-readable accessibility tree (auto-waits for idle)
andy tap "Button text"           # tap by a11y text or content_desc
andy tap 500,300                 # tap by coordinates
andy swipe 500 1500 500 500      # swipe (optional 5th arg: duration_ms, default 300)
andy type "hello"                # type text
andy key 4                       # send keycode (3=HOME, 4=BACK, 66=ENTER)
andy launch                      # launch ANDY_PACKAGE
andy stop                        # force-stop ANDY_PACKAGE (rarely needed — launch auto-closes existing)
andy reset                       # clear app data & stop (pm clear ANDY_PACKAGE)
andy open-url https://example.com # open URL in ANDY_PACKAGE
andy wait-for-idle               # explicit idle wait (rarely needed)
andy screens                     # list all screens (debug)
```

Use `--screen <name>` for non-default screens.
