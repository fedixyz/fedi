/**
 * LocalStorage api wrapped in safe calls for web-only storage usage.
 */
export const localStorageApi = {
    getItem(key: string): string | null {
        try {
            return localStorage.getItem(key)
        } catch {
            return null
        }
    },
    setItem(key: string, item: string): void {
        try {
            localStorage.setItem(key, item)
        } catch {
            // localStorage unavailable - no-op
        }
    },
    removeItem(key: string): void {
        try {
            localStorage.removeItem(key)
        } catch {
            // localStorage unavailable - no-op
        }
    },
}

/**
 * LocalStorage api wrapped in async calls to better align with native's
 * AsyncStorage, and to future-proof for non-synchronous storage.
 */
export const asyncLocalStorage = {
    getItem: (key: string) => Promise.resolve(localStorageApi.getItem(key)),
    setItem: (key: string, item: string) =>
        Promise.resolve(localStorageApi.setItem(key, item)),
    removeItem: (key: string) =>
        Promise.resolve(localStorageApi.removeItem(key)),
}

const PENDING_DEEPLINK_KEY = 'fedi_pending_deeplink'

export function getPendingDeeplink(): string | null {
    return localStorageApi.getItem(PENDING_DEEPLINK_KEY)
}

export function setPendingDeeplink(url: string): void {
    localStorageApi.setItem(PENDING_DEEPLINK_KEY, url)
}

export function clearPendingDeeplink(): void {
    localStorageApi.removeItem(PENDING_DEEPLINK_KEY)
}
