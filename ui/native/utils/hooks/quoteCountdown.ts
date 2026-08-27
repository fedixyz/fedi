import { useEffect, useState } from 'react'

/**
 * Seconds remaining until a bridge-issued quote expires.
 *
 * The bridge enforces validity lazily — nothing fires at expiry on its side —
 * so the UI owns the clock: it ticks every second while a deadline exists and
 * reports expiry so callers can refresh the quote before the user can act on
 * a stale one.
 */
export function useQuoteCountdown(validUntilSecs: number | null | undefined): {
    /** `m:ss` remaining, or null when no deadline exists. */
    remainingLabel: string | null
    isExpired: boolean
} {
    const [nowSecs, setNowSecs] = useState(() => Math.floor(Date.now() / 1000))

    useEffect(() => {
        if (!validUntilSecs) return
        // stop ticking once expired: further renders change nothing until a
        // fresh deadline arrives and restarts the effect
        const tick = () => {
            const now = Math.floor(Date.now() / 1000)
            setNowSecs(now)
            if (now >= validUntilSecs) clearInterval(timer)
        }
        const timer = setInterval(tick, 1000)
        tick()
        return () => clearInterval(timer)
    }, [validUntilSecs])

    if (!validUntilSecs) return { remainingLabel: null, isExpired: false }

    const remaining = Math.max(0, validUntilSecs - nowSecs)
    const minutes = Math.floor(remaining / 60)
    const seconds = remaining % 60
    return {
        remainingLabel: `${minutes}:${String(seconds).padStart(2, '0')}`,
        isExpired: remaining <= 0,
    }
}
