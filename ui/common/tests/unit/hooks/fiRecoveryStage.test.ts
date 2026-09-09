import { act, waitFor } from '@testing-library/react'

import { useWalletServiceRecoveryStage } from '../../../hooks/fi'
import { setFiStatus, setupStore, upsertFederation } from '../../../redux'
import type { RpcFiStatus } from '../../../types/bindings'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { renderHookWithBridge } from '../../utils/render'

const FED = 'federation-1'

const restoredStatus = (freshness: 'unsynced' | 'fresh'): RpcFiStatus => ({
    type: 'restored',
    formation: {
        snapshotGeneration: 3,
        formationId: 'formation-1',
        federationInvite: 'fed11invite',
        federationName: 'Restored Wallet Service',
        seats: [],
        phase: 'formed',
        freshness,
        backupEligible: false,
    },
})

describe('common/hooks/fi useWalletServiceRecoveryStage', () => {
    it('advances from rejoining to ready when the federation loads', async () => {
        const store = setupStore()
        store.dispatch(setFiStatus(restoredStatus('fresh')))
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
