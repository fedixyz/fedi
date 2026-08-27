import { useEffect, useRef, useState } from 'react'

export type DampedValueOptions = {
    /** How long a value must stay raised before it is shown. */
    showAfterMs: number
    /** How long it must stay cleared before the shown value is dropped. */
    hideAfterMs: number
    /** Once shown, the shortest time it stays on screen. */
    minVisibleMs: number
}

/**
 * Holds a flapping value steady so the screen does not flicker.
 *
 * The FI driver reports failure as a *level*, not an event:
 * `FormationSnapshot.last_error` carries a code while an attempt is failing and
 * is republished as `None` at the top of the next attempt, because the bridge
 * never persists it (`db.rs` reloads it as `None`). The retry backoff starts at
 * one second, so a single flaky fleet manager pushes error → clear → error at a
 * rate that reads as a strobing banner, worst at the moment the user is
 * watching most closely.
 *
 * Three thresholds, deliberately asymmetric — slow to alarm, slower to relax,
 * the shape alerting systems use:
 *
 * - `showAfterMs` swallows any failure the driver recovers from on its own.
 * - `hideAfterMs` stops the banner vanishing on the next attempt's optimistic
 *   `None`, which arrives long before that attempt has proved anything.
 * - `minVisibleMs` guarantees a banner the user has started reading cannot be
 *   pulled away mid-sentence.
 *
 * Returns the value being displayed, not a boolean, so a caller can still
 * render the error's text while the value itself has already cleared. A value
 * that changes while one is already on screen swaps in at once: the banner is
 * present either way, so replacing its text is not a flicker.
 *
 * Callers must not route a terminal failure through this. Nothing will retry it
 * away, so delaying it only delays the truth.
 */
export function useDampedValue<T>(
    value: T | null,
    { showAfterMs, hideAfterMs, minVisibleMs }: DampedValueOptions,
): T | null {
    const [shown, setShown] = useState<T | null>(null)
    const shownAtRef = useRef(0)

    useEffect(() => {
        // Both settled the same way: nothing to schedule. Any change to
        // `value` re-runs this effect and cancels the pending timer through
        // the cleanup, which is what makes a short blip cost nothing.
        if ((value === null) === (shown === null)) {
            if (value !== null && value !== shown) setShown(value)
            return
        }

        if (value !== null) {
            const timer = setTimeout(() => {
                shownAtRef.current = Date.now()
                setShown(value)
            }, showAfterMs)
            return () => clearTimeout(timer)
        }

        const heldForMs = Date.now() - shownAtRef.current
        const timer = setTimeout(
            () => setShown(null),
            Math.max(hideAfterMs, minVisibleMs - heldForMs),
        )
        return () => clearTimeout(timer)
    }, [value, shown, showAfterMs, hideAfterMs, minVisibleMs])

    return shown
}
