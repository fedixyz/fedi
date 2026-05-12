/**
 * LocalStorage api wrapped in async calls to better align with native's
 * AsyncStorage, and to future-proof for non-synchronous storage.
 */
export const asyncLocalStorage = {
    getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
    setItem: (key: string, item: string) =>
        Promise.resolve(localStorage.setItem(key, item)),
    removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
}

const PENDING_DEEPLINK_KEY = 'fedi_pending_deeplink'

export function setPendingDeeplink(url: string): void {
    try {
        localStorage.setItem(PENDING_DEEPLINK_KEY, url)
    } catch {
        // localStorage unavailable — no-op
    }
}

export function getPendingDeeplink(): string | null {
    try {
        return localStorage.getItem(PENDING_DEEPLINK_KEY)
    } catch {
        // localStorage unavailable
    }
    return null
}

export function clearPendingDeeplink(): void {
    try {
        localStorage.removeItem(PENDING_DEEPLINK_KEY)
    } catch {
        // localStorage unavailable — no-op
    }
}
