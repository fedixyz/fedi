import { FiSimulator } from '../../../../devtools/fi/simulator'
import { withFiSimulator } from '../../../../devtools/fi/transport'

describe('withFiSimulator', () => {
    it('should answer fiClient calls from the simulator when enabled', async () => {
        const realRpc = jest.fn()
        const rpc = withFiSimulator(
            realRpc,
            new FiSimulator('happyPath'),
            () => true,
        )
        const result = await rpc<{ type: string }>('fiClientStatus', {})
        expect(result.type).toBe('ready')
        expect(realRpc).not.toHaveBeenCalled()
    })

    it('should forward every call to the real bridge when disabled', async () => {
        const realRpc = jest.fn().mockResolvedValue('real')
        const rpc = withFiSimulator(
            realRpc,
            new FiSimulator('happyPath'),
            () => false,
        )
        await expect(rpc('fiClientStatus', {})).resolves.toBe('real')
        expect(realRpc).toHaveBeenCalledWith('fiClientStatus', {})
    })

    it('should not append mock wallets to listFederations when disabled', async () => {
        const realRpc = jest
            .fn()
            .mockResolvedValue([{ id: 'fed-a', balance: 0 }])
        const simulator = new FiSimulator('happyPath')
        simulator.setPayerSource('mock')
        const rpc = withFiSimulator(realRpc, simulator, () => false)
        await expect(rpc('listFederations', {})).resolves.toEqual([
            { id: 'fed-a', balance: 0 },
        ])
    })

    it('should read the switch on every call', async () => {
        const realRpc = jest.fn().mockResolvedValue('real')
        let enabled = false
        const rpc = withFiSimulator(
            realRpc,
            new FiSimulator('happyPath'),
            () => enabled,
        )
        await expect(rpc('fiClientStatus', {})).resolves.toBe('real')
        enabled = true
        const result = await rpc<{ type: string }>('fiClientStatus', {})
        expect(result.type).toBe('ready')
        expect(realRpc).toHaveBeenCalledTimes(1)
    })
})
