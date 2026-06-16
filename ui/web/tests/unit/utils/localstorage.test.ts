import {
    asyncLocalStorage,
    localStorageApi,
} from '../../../src/utils/localstorage'

describe('utils/localstorage', () => {
    const key = 'test-key'
    const value = 'test-value'

    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should wrap localStorage with synchronous safe methods', () => {
        localStorageApi.setItem(key, value)

        expect(localStorageApi.getItem(key)).toBe(value)

        localStorageApi.removeItem(key)

        expect(localStorageApi.getItem(key)).toBeNull()
    })

    it('should ignore localStorage errors in synchronous methods', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage unavailable')
        })
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage unavailable')
        })
        jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('storage unavailable')
        })

        expect(localStorageApi.getItem(key)).toBeNull()
        expect(() => localStorageApi.setItem(key, value)).not.toThrow()
        expect(() => localStorageApi.removeItem(key)).not.toThrow()
    })

    it('should expose async methods for common storage compatibility', async () => {
        await asyncLocalStorage.setItem(key, value)

        await expect(asyncLocalStorage.getItem(key)).resolves.toBe(value)

        await asyncLocalStorage.removeItem(key)

        await expect(asyncLocalStorage.getItem(key)).resolves.toBeNull()
    })
})
