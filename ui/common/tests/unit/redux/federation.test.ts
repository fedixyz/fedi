import {
    refreshGuardianStatuses,
    removeFederations,
    selectFederations,
    selectRecentlyUsedFederationIds,
    setFederations,
    setLastUsedFederationId,
    setPayFromFederationId,
    setupStore,
    selectLoadedFederation,
    updateFederationBalance,
    setIsInternetUnreachable,
} from '../../../redux'
import { MSats } from '../../../types'
import { GuardianStatus } from '../../../types/bindings'
import { mockFederation1, mockFederation2 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'

const mockFederation3 = { ...mockFederation1, id: '3' }

describe('common/redux/federation guardian refresh', () => {
    const reachable: GuardianStatus[] = [
        {
            online: {
                guardian: 'wss://guardian.example',
                fman_name: null,
                latency_ms: 10,
            },
        },
    ]

    it('should preserve balance updates received during a health check', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const pending = store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        store.dispatch(
            updateFederationBalance({
                federationId: mockFederation1.id,
                balance: 123456 as MSats,
            }),
        )
        complete(reachable)
        await pending.unwrap()
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.balance,
        ).toBe(123456)
    })

    it('should not restore a federation removed during a health check', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const pending = store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        store.dispatch(removeFederations([mockFederation1.id]))
        complete(reachable)
        await pending.unwrap()
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id),
        ).toBeUndefined()
    })

    it('should disregard probe failures collected after the phone loses internet', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const pending = store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        store.dispatch(setIsInternetUnreachable(true))
        complete([
            {
                timeout: {
                    guardian: 'wss://guardian.example',
                    fman_name: null,
                    elapsed: '10s',
                },
            },
        ])
        await pending.unwrap()
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.status,
        ).toBe('unknown')
    })
})

describe('common/redux/federation › removeFederations', () => {
    it('should prune a removed federation from recentlyUsedFederationIds and move payFromFederationId off it', () => {
        const store = setupStore()
        store.dispatch(
            setFederations([mockFederation1, mockFederation2, mockFederation3]),
        )
        store.dispatch(setLastUsedFederationId(mockFederation1.id))
        store.dispatch(setLastUsedFederationId(mockFederation2.id))
        store.dispatch(setPayFromFederationId(mockFederation2.id))

        store.dispatch(removeFederations([mockFederation2.id]))

        expect(selectRecentlyUsedFederationIds(store.getState())).not.toContain(
            mockFederation2.id,
        )
        expect(store.getState().federation.payFromFederationId).not.toBe(
            mockFederation2.id,
        )
    })

    it('should set payFromFederationId to null when the last federation is removed', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))

        store.dispatch(removeFederations([mockFederation1.id]))

        expect(store.getState().federation.payFromFederationId).toBeNull()
    })

    it('should be a no-op for an id that is not joined', () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1, mockFederation2]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))

        store.dispatch(removeFederations(['unknown-id']))

        expect(selectFederations(store.getState()).map(f => f.id)).toEqual([
            mockFederation1.id,
            mockFederation2.id,
        ])
        expect(store.getState().federation.payFromFederationId).toBe(
            mockFederation1.id,
        )
    })

    it('should leave federations not named in the payload untouched', () => {
        const store = setupStore()
        store.dispatch(
            setFederations([mockFederation1, mockFederation2, mockFederation3]),
        )

        store.dispatch(removeFederations([mockFederation2.id]))

        expect(selectFederations(store.getState()).map(f => f.id)).toEqual([
            mockFederation1.id,
            mockFederation3.id,
        ])
    })
})
