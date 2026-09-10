import { attachFiDevTools } from '../../../../devtools/fi'
import { FI_DEV_SWITCHES_KEY } from '../../../../devtools/fi/switches'
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

describe('attachFiDevTools', () => {
    it('should apply the persisted switches once loaded', async () => {
        const storage = memoryStorage({
            [FI_DEV_SWITCHES_KEY]: JSON.stringify({
                simulator: 'off',
                payerSource: 'none',
            }),
        })
        const realRpc = jest.fn().mockResolvedValue('real')
        const tools = attachFiDevTools(realRpc, storage)
        await tools.ready
        expect(tools.getSwitches()).toEqual({
            simulator: 'off',
            payerSource: 'none',
        })
        expect(tools.simulator.getPayerSource()).toBe('none')
        await expect(tools.rpc('fiClientStatus', {})).resolves.toBe('real')
    })

    it('should seed mock payers and persist when switched to mock', async () => {
        const storage = memoryStorage()
        const tools = attachFiDevTools(jest.fn(), storage)
        await tools.ready
        await tools.setSwitches({ simulator: 'on', payerSource: 'mock' })
        expect(tools.simulator.listMockFederations().length).toBeGreaterThan(0)
        expect(storage.setItem).toHaveBeenCalledWith(
            FI_DEV_SWITCHES_KEY,
            JSON.stringify({ simulator: 'on', payerSource: 'mock' }),
        )
    })
})
