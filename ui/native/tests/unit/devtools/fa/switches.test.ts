import type { StorageApi } from '@fedi/common/types'

import {
    DEFAULT_FA_DEV_SWITCHES,
    FA_DEV_SWITCHES_KEY,
    loadFaDevSwitches,
    saveFaDevSwitches,
} from '../../../../devtools/fa/switches'

const memoryStorage = (initial: Record<string, string> = {}): StorageApi => {
    const items = { ...initial }
    return {
        getItem: jest.fn(async key => items[key] ?? null),
        setItem: jest.fn(async (key, value) => {
            items[key] = value
        }),
        removeItem: jest.fn(async key => {
            delete items[key]
        }),
    }
}

describe('fi dev switches', () => {
    it('should default the simulator off so a dev build holds no mock federations', () => {
        expect(DEFAULT_FA_DEV_SWITCHES.simulator).toBe('off')
    })

    it('should return the defaults when nothing is stored', async () => {
        const storage = memoryStorage()
        await expect(loadFaDevSwitches(storage)).resolves.toEqual(
            DEFAULT_FA_DEV_SWITCHES,
        )
        expect(storage.getItem).toHaveBeenCalledWith(FA_DEV_SWITCHES_KEY)
    })

    it('should return what was saved', async () => {
        const storage = memoryStorage()
        await saveFaDevSwitches(storage, {
            simulator: 'off',
            payerSource: 'none',
        })
        await expect(loadFaDevSwitches(storage)).resolves.toEqual({
            simulator: 'off',
            payerSource: 'none',
        })
    })

    it('should fall back per field when the stored value is partial or invalid', async () => {
        const storage = memoryStorage({
            [FA_DEV_SWITCHES_KEY]: JSON.stringify({
                simulator: 'off',
                payerSource: 'bogus',
            }),
        })
        await expect(loadFaDevSwitches(storage)).resolves.toEqual({
            simulator: 'off',
            payerSource: 'mock',
        })
    })

    it('should return the defaults when the stored value is not JSON', async () => {
        const storage = memoryStorage({ [FA_DEV_SWITCHES_KEY]: '{not json' })
        await expect(loadFaDevSwitches(storage)).resolves.toEqual(
            DEFAULT_FA_DEV_SWITCHES,
        )
    })
})
