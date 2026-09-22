import { act, waitFor } from '@testing-library/react'

import { useOnchainSendLimits } from '../../../hooks/amount/useOnchainSendLimits'
import {
    setFederations,
    setupStore,
    updateFederationBalance,
} from '../../../redux'
import { MSats } from '../../../types'
import { RpcPayAddressLimits } from '../../../types/bindings'
import { mockFederation1, mockFederation2 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'

describe('useOnchainSendLimits', () => {
    const limits: RpcPayAddressLimits = {
        minSpendable: 10_000_000 as MSats,
        maxSpendable: 19_999_999 as MSats,
    }
    let store: ReturnType<typeof setupStore>
    let fedimint: ReturnType<typeof createMockFedimintBridge>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        fedimint = createMockFedimintBridge({
            getPayAddressLimits: () => Promise.resolve(limits),
        })
    })

    it('fetches once for an address and rounds the maximum down to sats', async () => {
        fedimint.getPayAddressLimits
            .mockResolvedValueOnce(limits)
            .mockImplementation(() => new Promise(() => {}))
        const { result, rerender } = renderHookWithState(
            () => useOnchainSendLimits({ address: 'destination' }, '1'),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(result.current).toEqual({
                minimumAmount: 10_000,
                maximumAmount: 19_999,
            })
        })
        rerender()
        expect(fedimint.getPayAddressLimits).toHaveBeenCalledTimes(1)
    })

    it.each(['wallet', 'address', 'balance', 'removed address'])(
        'discards limits after the %s changes and ignores an older response',
        async changed => {
            let address: { address: string } | undefined = {
                address: 'destination',
            }
            let federationId = '1'
            const { result, rerender } = renderHookWithState(
                () => useOnchainSendLimits(address, federationId),
                store,
                fedimint,
            )
            await waitFor(() => expect(result.current).not.toBeNull())

            let resolvePending!: (value: RpcPayAddressLimits) => void
            fedimint.getPayAddressLimits.mockImplementation(
                () => new Promise(resolve => (resolvePending = resolve)),
            )
            act(() => {
                store.dispatch(
                    updateFederationBalance({
                        federationId,
                        balance: 30_000_000 as MSats,
                    }),
                )
            })
            expect(result.current).toBeNull()

            fedimint.getPayAddressLimits.mockRejectedValue(
                new Error('limit lookup failed'),
            )
            if (changed === 'wallet') federationId = '2'
            if (changed === 'address') address = { address: 'new destination' }
            if (changed === 'removed address') address = undefined
            await act(async () => {
                if (changed === 'balance') {
                    store.dispatch(
                        updateFederationBalance({
                            federationId,
                            balance: 40_000_000 as MSats,
                        }),
                    )
                }
                rerender()
            })
            await act(async () => resolvePending(limits))
            expect(result.current).toBeNull()
        },
    )
})
