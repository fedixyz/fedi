import { listGateways, setupStore } from '../../../redux'
import { RpcLightningGateway } from '../../../types/bindings'
import { createMockFedimintBridge } from '../../utils/fedimint'

const federationId = 'test-federation-id'

const gateway: RpcLightningGateway = {
    id: { kind: 'lnv2', url: 'https://gateway.example' },
    nodePubKey: '02'.padEnd(66, '0'),
    gatewayId: '03'.padEnd(66, '0'),
    api: 'https://gateway.example',
}

describe('listGateways', () => {
    it('serves a non-empty gateway list from the cache', async () => {
        const store = setupStore()
        const fedimint = createMockFedimintBridge({
            listGateways: jest.fn().mockResolvedValue([gateway]),
        })

        await store.dispatch(listGateways({ fedimint, federationId }))
        const second = await store
            .dispatch(listGateways({ fedimint, federationId }))
            .unwrap()

        expect(second).toEqual([gateway])
        expect(fedimint.listGateways).toHaveBeenCalledTimes(1)
    })

    it('refetches when the cached gateway list is empty', async () => {
        const store = setupStore()
        const fedimint = createMockFedimintBridge({
            listGateways: jest
                .fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([gateway]),
        })

        const first = await store
            .dispatch(listGateways({ fedimint, federationId }))
            .unwrap()
        const second = await store
            .dispatch(listGateways({ fedimint, federationId }))
            .unwrap()

        expect(first).toEqual([])
        expect(second).toEqual([gateway])
        expect(fedimint.listGateways).toHaveBeenCalledTimes(2)
    })
})
