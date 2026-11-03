import { act, waitFor } from '@testing-library/react'

import { useWalletServiceRecoveryStage } from '../../../hooks/fa'
import { setFaStatus, setupStore, upsertFederation } from '../../../redux'
import type { RpcFaStatus } from '../../../types/bindings'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithBridge } from '../../utils/render'

const FED = 'federation-1'

const restoredStatus = (freshness: 'unsynced' | 'fresh'): RpcFaStatus => ({
    type: 'formed',
    federation: {
        formationId: 'formation-1',
        federationInvite: 'fed11invite',
        federationName: 'Restored Wallet Service',
        seats: [],
        freshness,
        backupEligible: false,
        origin: 'backup',
    },
})

describe('common/hooks/fi useWalletServiceRecoveryStage', () => {
    it('advances from rejoining to ready when the federation loads', async () => {
        const store = setupStore()
        store.dispatch(setFaStatus(restoredStatus('fresh')))
        const fedimint = createMockFedimintBridge({
            parseInviteCode: async () => ({ federationId: FED }),
        })
        const { result } = renderHookWithBridge(
            () => useWalletServiceRecoveryStage(),
            store,
            fedimint,
        )
        await waitFor(() => expect(result.current.stage).toBe('rejoining'))

        act(() => {
            store.dispatch(
                upsertFederation({
                    ...mockFederation1,
                    id: FED,
                    init_state: 'ready',
                    recovering: false,
                }),
            )
        })
        await waitFor(() => expect(result.current.isUsable).toBe(true))
        expect(result.current.stage).toBe('ready')
        expect(result.current.federationId).toBe(FED)
    })
})
