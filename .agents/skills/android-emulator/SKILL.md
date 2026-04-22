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

## Multiple screens

Andy supports running multiple app instances on separate virtual displays. Use `ANDY_SCREEN` env var or `--screen <name>` flag.

```bash
# Target a specific screen
ANDY_SCREEN=2 andy launch
andy --screen 2 launch          # equivalent
```

**Use `&&` to chain steps on one screen, and parallel Bash tool calls across screens:**

```bash
# Tool call 1: default screen
andy launch && andy tap "Get started" && andy a11y

# Tool call 2 (parallel): screen 2
andy --screen 2 launch && andy --screen 2 tap "Get started" && andy --screen 2 a11y
```

- Each screen gets its own package (e.g. `com.fedi.dev01` for default, `com.fedi.dev02` for screen 2).
- **Onboarding script:** `./scripts/andy/reset-and-onboard.sh` resets and completes app onboarding via the remote bridge API (no UI tapping needed). Use `ANDY_SCREEN` to target a screen. Run in parallel for multiple screens. Pass `--no-launch` to onboard without launching the app.
- **DM setup script:** `./scripts/andy/setup-dm.sh` resets both screens, onboards, creates a DM via bridge API, sends an initial message, then launches both apps on the chat tab. Takes ~25s.
- **Acquire money script:** `./scripts/andy/acquire-money.sh [amount_msats]` joins a dev federation (if needed) and receives ecash. Default 100000 msats. Use `ANDY_SCREEN` to target a screen. Example: `ANDY_SCREEN=2 bash scripts/andy/acquire-money.sh 500000`
- **Deep links with `open-url`:** If `open-url` fails with "Activity class does not exist", the package uses a shared activity class (e.g. `com.fedi.MainActivity` not `com.fedi.dev00.MainActivity`). Use `adb shell am start` directly:
  ```bash
  # Find the correct activity: adb shell dumpsys package com.fedi.dev00 | grep activity
  # Find the display ID: andy info -> display_id field
  adb shell am start --display <display_id> -a android.intent.action.VIEW \
    -d 'fedi://user/@userId:server' -n com.fedi.dev00/com.fedi.MainActivity
  ```
- **Notification permission dialogs** may appear after sending the first message. Dismiss with `andy key 4` (BACK). Do NOT tap the dialog buttons by coordinates - they can trigger navigation to system App Info.

## Reference

```bash
andy info                        # screen info (JSON)
andy screenshot [--no-wait] /tmp/s.png  # save screenshot (auto-waits for idle)
andy a11y [--no-wait]            # human-readable accessibility tree (auto-waits for idle)
andy tap "Button text"           # tap by a11y text or content_desc (retries 3x by default)
andy tap --tries 5 "Button text" # tap with custom retry count
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

Use `--screen <name>` or `ANDY_SCREEN=<name>` for non-default screens.
