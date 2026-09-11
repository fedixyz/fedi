import {
    DEFAULT_FI_DEV_SWITCHES,
    FI_DEV_SWITCHES_KEY,
    loadFiDevSwitches,
    saveFiDevSwitches,
} from '../../../../devtools/fi/switches'
import type { StorageApi } from '../../../../types'

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
        expect(DEFAULT_FI_DEV_SWITCHES.simulator).toBe('off')
    })

    it('should return the defaults when nothing is stored', async () => {
        const storage = memoryStorage()
        await expect(loadFiDevSwitches(storage)).resolves.toEqual(
            DEFAULT_FI_DEV_SWITCHES,
        )
        expect(storage.getItem).toHaveBeenCalledWith(FI_DEV_SWITCHES_KEY)
    })

    it('should return what was saved', async () => {
        const storage = memoryStorage()
        await saveFiDevSwitches(storage, {
            simulator: 'off',
            payerSource: 'none',
        })
        await expect(loadFiDevSwitches(storage)).resolves.toEqual({
            simulator: 'off',
            payerSource: 'none',
        })
    })

    it('should fall back per field when the stored value is partial or invalid', async () => {
        const storage = memoryStorage({
            [FI_DEV_SWITCHES_KEY]: JSON.stringify({
                simulator: 'off',
                payerSource: 'bogus',
            }),
        })
        await expect(loadFiDevSwitches(storage)).resolves.toEqual({
            simulator: 'off',
            payerSource: 'mock',
        })
    })

    it('should return the defaults when the stored value is not JSON', async () => {
        const storage = memoryStorage({ [FI_DEV_SWITCHES_KEY]: '{not json' })
        await expect(loadFiDevSwitches(storage)).resolves.toEqual(
            DEFAULT_FI_DEV_SWITCHES,
        )
    })
})
