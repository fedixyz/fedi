---
name: ios-emulator
description: Control and interact with the iOS simulator via the steve CLI — launch apps, tap UI elements, take screenshots, and read accessibility trees.
---

# Steve - iOS automation

- `steve` is added to PATH by the repo dev shell and is backed by `scripts/ui/steve`.
- Use `steve` to verify iOS behavior and navigate the app.
- The wrapper re-enters the repo's `.#xcode` shell automatically when needed.

## Quick start

```bash
# Launch app and verify
steve launch && steve a11y && steve screenshot /tmp/s.png
# Use Read tool on screenshot only if a11y is ambiguous or visual verification needed.

# Tap by exact accessibility text and verify
steve tap "Get started" && steve a11y && steve screenshot /tmp/s.png

# Tap unlabeled element by coordinates (from a11y bounds)
steve tap 200,780 && steve a11y && steve screenshot /tmp/s.png

# Scroll down to find more elements
steve swipe 200 700 200 200 300 && steve a11y && steve screenshot /tmp/s.png

# Type into the focused element
steve type "hello"
```

## Workflow tips

- **`screenshot` and `a11y` auto-wait for idle.** You usually do NOT need `wait-for-idle` or `sleep` before them.
- **Chain commands with `&&`** for tap-then-verify workflows: `steve tap "Continue" && steve screenshot /tmp/s.png`
- **Always check `a11y` on unfamiliar screens** before tapping by text. Some controls are exposed only by coordinates or IDs.
- **`tap "text"` is exact-match only.** Use the exact visible accessibility text from `a11y`.
- **`a11y` output is normalized, not raw Appium XML.** Bounds are printed in `(left,top,right,bottom)` form.
- **For navigation, prefer visible buttons like `HeaderBackButton`, `Close`, or direct coordinate taps.** There is no Android-style `key 4 BACK` command here.
- **If the app or simulator gets into a bad state, reuse `launch`, `stop`, or `reset`** rather than trying random taps.
- **Use screenshots for real UI verification.** `a11y` is enough for navigation, but screenshots are better for confirming layout and styling.

## Reference

```bash
steve screens                      # list available iOS simulators
steve info                         # print selected simulator info as JSON
steve launch                       # launch the configured bundle ID
steve stop                         # terminate the configured bundle ID
steve reset                        # uninstall the configured bundle ID, reinstall if --app is provided
steve open-url https://example.com # open URL in the simulator
steve wait-for-idle                # wait until the page source is stable
steve screenshot /tmp/s.png        # save an app screenshot
steve a11y                         # print a normalized accessibility tree
steve tap "Button text"            # tap by exact accessibility text
steve tap 200,780                  # tap by coordinates
steve swipe 200 700 200 200 300    # swipe (optional 5th arg: duration_ms)
steve type "hello"                 # type into the focused element
```

Useful options:

```bash
steve --device <UDID> ...
steve --bundle com.fedi ...
steve --app /absolute/path/to/FediReactNative.app ...
steve --no-wait ...
steve --no-boot ...
```
