import { setupStore } from '@fedi/common/redux'
import { receiveEcash } from '@fedi/common/redux/wallet'
import { ErrorCode } from '@fedi/common/types/bindings'
import { BridgeError } from '@fedi/common/utils/errors'

import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'

const bridgeThrowing = (errorCode: ErrorCode | null) =>
    createMockFedimintBridge({
        receiveEcash: () =>
            Promise.reject(
                new BridgeError({
                    errorCode,
                    error: 'We already reissued these notes',
                    detail: 'We already reissued these notes',
                }),
            ),
    })

describe('common/redux/wallet › receiveEcash', () => {
    it('resolves a failed result when notes were already reissued', async () => {
        const store = setupStore()

        const result = await store
            .dispatch(
                receiveEcash({
                    fedimint: bridgeThrowing('ecashAlreadySpent'),
                    federationId: mockFederation1.id,
                    ecash: 'token',
                }),
            )
            .unwrap()

        expect(result.status).toBe('failed')
    })

    it('rejects for bridge errors that are not already-spent', async () => {
        const store = setupStore()

        await expect(
            store
                .dispatch(
                    receiveEcash({
                        fedimint: bridgeThrowing('panic'),
                        federationId: mockFederation1.id,
                        ecash: 'token',
                    }),
                )
                .unwrap(),
        ).rejects.toBeDefined()
    })
})
