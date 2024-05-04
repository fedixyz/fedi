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
