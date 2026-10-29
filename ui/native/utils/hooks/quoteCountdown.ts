import { useEffect, useRef, useState } from 'react'

/**
 * Seconds remaining until a bridge-issued quote expires.
 *
 * The bridge enforces validity lazily — nothing fires at expiry on its side —
 * so the UI owns the clock: it ticks every second while a deadline exists and
 * reports expiry so callers can refresh the quote before the user can act on
 * a stale one.
 */
function useQuoteCountdown(validUntilSecs: number | null | undefined): {
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

/**
 * The countdown for a quote on screen, refreshing it once when it expires.
 *
 * The bridge only checks quote validity at pay time, so the screen owns the
 * clock: at expiry the caller locks paying and a fresh quote is fetched before
 * the user can act on a stale price. The clock stops while `isPaused`, for
 * anything that covers the price or outlasts the quote, such as a top-up.
 *
 * One attempt per expiry, re-armed only by a quote that is actually valid.
 * Not keyed on `validUntil`: an already-expired quote carries a new one, which
 * would read as a fresh deadline worth another attempt. With no quote at all
 * nothing is re-armed, so a quote that arrives expired is not retried either.
 */
export function useQuoteAutoRefresh(
    validUntilSecs: number | null | undefined,
    isPaused: boolean,
    isRefreshing: boolean,
    onRefresh: () => unknown,
) {
    const countdown = useQuoteCountdown(isPaused ? null : validUntilSecs)
    const { isExpired } = countdown
    const hasAutoRefreshed = useRef(false)
    useEffect(() => {
        if (validUntilSecs == null || isRefreshing) return
        if (!isExpired) {
            hasAutoRefreshed.current = false
            return
        }
        if (hasAutoRefreshed.current) return
        hasAutoRefreshed.current = true
        onRefresh()
    }, [isExpired, validUntilSecs, isRefreshing, onRefresh])
    return countdown
}
