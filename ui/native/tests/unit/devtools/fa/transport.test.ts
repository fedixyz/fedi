import { FaSimulator } from '../../../../devtools/fa/simulator'
import { withFaSimulator } from '../../../../devtools/fa/transport'

describe('withFaSimulator', () => {
    it('should answer faClient calls from the simulator when enabled', async () => {
        const realRpc = jest.fn()
        const rpc = withFaSimulator(realRpc, new FaSimulator(), () => true)
        const result = await rpc<{ type: string }>('faClientStatus', {})
        expect(result.type).toBe('ready')
        expect(realRpc).not.toHaveBeenCalled()
    })

    it('should forward every call to the real bridge when disabled', async () => {
        const realRpc = jest.fn().mockResolvedValue('real')
        const rpc = withFaSimulator(realRpc, new FaSimulator(), () => false)
        await expect(rpc('faClientStatus', {})).resolves.toBe('real')
        expect(realRpc).toHaveBeenCalledWith('faClientStatus', {})
    })

    it('should not append mock wallets to listFederations when disabled', async () => {
        const realRpc = jest
            .fn()
            .mockResolvedValue([{ id: 'fed-a', balance: 0 }])
        const simulator = new FaSimulator()
        simulator.setPayerSource('mock')
        const rpc = withFaSimulator(realRpc, simulator, () => false)
        await expect(rpc('listFederations', {})).resolves.toEqual([
            { id: 'fed-a', balance: 0 },
        ])
    })

    it('should read the switch on every call', async () => {
        const realRpc = jest.fn().mockResolvedValue('real')
        let enabled = false
        const rpc = withFaSimulator(realRpc, new FaSimulator(), () => enabled)
        await expect(rpc('faClientStatus', {})).resolves.toBe('real')
        enabled = true
        const result = await rpc<{ type: string }>('faClientStatus', {})
        expect(result.type).toBe('ready')
        expect(realRpc).toHaveBeenCalledTimes(1)
    })
})
