import type { StorageApi } from '@fedi/common/types'
import type { FedimintBridge } from '@fedi/common/utils/fedimint'

import { attachFiDevTools } from '../../../../devtools/fi'
import { FI_DEV_SWITCHES_KEY } from '../../../../devtools/fi/switches'

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

    it('should announce no federation while the simulator is off', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        const emit = jest.fn()
        // attach before the storage load resolves, the order native/bridge
        // uses: awaiting first leaves no emitter wired during the seed and
        // passes whatever the seed does
        tools.attachBridge({ emit } as unknown as FedimintBridge)
        await tools.ready

        expect(tools.simulator.listMockFederations()).toEqual([])
        expect(emit).not.toHaveBeenCalledWith('federation', expect.anything())
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

    it('should jump to a screen through the player and return the screen', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready

        const screen = await tools.jumpTo('formation.dkgUnderway')

        expect(screen.route).toBe('WalletServiceProgress')
        expect(tools.player.current).toEqual({
            script: screen.script.name,
            checkpoint: 'dkgUnderway',
        })
    })

    it('should resolve the jump even when the script later fails', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        jest.spyOn(tools.player, 'run').mockRejectedValue(new Error('boom'))

        await expect(
            tools.jumpTo('formation.dkgUnderway'),
        ).resolves.toMatchObject({
            id: 'formation.dkgUnderway',
        })
    })

    it('should reject an unknown screen id', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())

        await expect(tools.jumpTo('nope')).rejects.toThrow(
            'unknown screen "nope"',
        )
    })

    it('should play a script from the start with real timing after a reset', async () => {
        jest.useFakeTimers()
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        const reset = jest.spyOn(tools.simulator, 'reset')
        const run = jest.spyOn(tools.player, 'run')

        const played = tools.play('formation.happyPath')

        expect(played.name).toBe('formation.happyPath')
        expect(reset).toHaveBeenCalledTimes(1)
        expect(run).toHaveBeenCalledWith(played, {})
        tools.player.cancel()
        jest.useRealTimers()
    })

    it('should reject an unknown script name', () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        expect(() => tools.play('nope')).toThrow('unknown script "nope"')
    })
})
