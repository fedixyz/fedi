import i18n from 'i18next'

import {
    initializeCommonStore,
    joinFederation,
    refreshFederations,
    refreshGuardianStatuses,
    removeFederations,
    selectLoadedFederation,
    setFederations,
    setGuardianMonitoringActive,
    setIsInternetUnreachable,
    setupStore,
    upsertFederation,
} from '../../../redux'
import { GuardianStatus } from '../../../types/bindings'
import { GUARDIAN_REFRESH_INTERVAL } from '../../../utils/federationHealth'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { mockStorageApi } from '../../utils/render'

const reachable: GuardianStatus[] = [
    { online: { guardian: 'guardian', latency_ms: 1 } },
]

describe('guardian monitoring', () => {
    let cleanup: (() => void) | undefined

    beforeEach(() => jest.useFakeTimers({ now: 0 }))
    afterEach(() => {
        cleanup?.()
        cleanup = undefined
        jest.useRealTimers()
    })

    it('refreshes in the foreground, resumes after reconnect, and stops on cleanup', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: async () => reachable,
        })
        let active = true
        let foreground!: (active: boolean) => void
        const unsubscribe = jest.fn()
        cleanup = initializeCommonStore({
            store,
            fedimint,
            storage: mockStorageApi,
            i18n,
            isForeground: () => active,
            subscribeForeground: listener => {
                foreground = listener
                return unsubscribe
            },
        })
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(1)
        await jest.advanceTimersByTimeAsync(GUARDIAN_REFRESH_INTERVAL)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(2)

        active = false
        foreground(false)
        await jest.advanceTimersByTimeAsync(180_000)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(2)
        active = true
        foreground(true)
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(3)

        store.dispatch(setIsInternetUnreachable(true))
        await jest.advanceTimersByTimeAsync(180_000)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(3)
        store.dispatch(setIsInternetUnreachable(false))
        await jest.advanceTimersByTimeAsync(0)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(4)
        cleanup()
        cleanup = undefined
        await jest.advanceTimersByTimeAsync(180_000)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(4)
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('shares in-flight checks and does not count cached snapshots repeatedly', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const first = store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        await store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(1)
        complete(reachable)
        await first
        await store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(1)
    })

    it('refreshes on each timer tick when a probe has normal network latency', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: () =>
                new Promise(resolve =>
                    setTimeout(() => resolve(reachable), 100),
                ),
        })
        cleanup = initializeCommonStore({
            store,
            fedimint,
            storage: mockStorageApi,
            i18n,
        })
        await jest.advanceTimersByTimeAsync(GUARDIAN_REFRESH_INTERVAL)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(2)
        await jest.advanceTimersByTimeAsync(GUARDIAN_REFRESH_INTERVAL)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(3)
    })

    it.each(['background', 'leave', 'network', 'reload'] as const)(
        'ignores an old response across a %s transition',
        async transition => {
            const store = setupStore()
            store.dispatch(setFederations([mockFederation1]))
            let complete!: (statuses: GuardianStatus[]) => void
            const fedimint = createMockFedimintBridge({
                getGuardianStatus: () =>
                    new Promise<GuardianStatus[]>(resolve => {
                        complete = resolve
                    }),
            })
            const old = store.dispatch(
                refreshGuardianStatuses({
                    fedimint,
                    federation: mockFederation1,
                }),
            )
            const completeOld = complete
            if (transition === 'background') {
                store.dispatch(setGuardianMonitoringActive(false))
                store.dispatch(setGuardianMonitoringActive(true))
            } else if (transition === 'leave') {
                store.dispatch(removeFederations([mockFederation1.id]))
                store.dispatch(
                    setFederations([
                        { ...mockFederation1, status: 'unknown' as const },
                    ]),
                )
            } else if (transition === 'network') {
                store.dispatch(setIsInternetUnreachable(true))
                store.dispatch(setIsInternetUnreachable(false))
            } else {
                store.dispatch(
                    upsertFederation({
                        id: mockFederation1.id,
                        init_state: 'loading',
                    }),
                )
                store.dispatch(
                    upsertFederation({
                        ...mockFederation1,
                        status: 'unknown' as const,
                    }),
                )
            }
            const next = store.dispatch(
                refreshGuardianStatuses({
                    fedimint,
                    federation: mockFederation1,
                }),
            )
            complete(reachable)
            await next
            completeOld([])
            await old
            expect(
                selectLoadedFederation(store.getState(), mockFederation1.id)
                    ?.status,
            ).toBe('online')
            expect(
                store.getState().federation.guardianHealth[mockFederation1.id]
                    ?.guardians,
            ).toEqual(reachable)
        },
    )

    it('preserves a warning while a list refresh waits for a new observation', async () => {
        const store = setupStore()
        store.dispatch(
            setFederations([
                { ...mockFederation1, status: 'offline' as const },
            ]),
        )
        const fedimint = createMockFedimintBridge({
            listFederations: async () => [{ ...mockFederation1, meta: {} }],
            getGuardianStatus: async () => reachable,
        })
        store.dispatch(setGuardianMonitoringActive(false))
        store.dispatch(
            setFederations([
                { ...mockFederation1, status: 'offline' as const },
            ]),
        )
        await store.dispatch(refreshFederations(fedimint)).unwrap()
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.status,
        ).toBe('offline')
    })

    it('reports an RPC failure as unknown and interrupts the observation window', async () => {
        const store = setupStore()
        store.dispatch(
            setFederations([
                { ...mockFederation1, status: 'offline' as const },
            ]),
        )
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: async () => {
                throw new Error('bridge unavailable')
            },
        })
        await store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.status,
        ).toBe('unknown')
    })

    it('does not revive an old outage warning while reconnecting', async () => {
        const store = setupStore()
        store.dispatch(
            setFederations([
                { ...mockFederation1, status: 'offline' as const },
            ]),
        )
        store.dispatch(setIsInternetUnreachable(true))
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.status,
        ).toBe('unknown')

        store.dispatch(setIsInternetUnreachable(false))
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.status,
        ).toBe('unknown')
    })

    it('preserves a current observation when internet availability is repeated', async () => {
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: async () => reachable,
        })
        await store.dispatch(
            refreshGuardianStatuses({ fedimint, federation: mockFederation1 }),
        )
        const health =
            store.getState().federation.guardianHealth[mockFederation1.id]
        store.dispatch(setIsInternetUnreachable(false))
        expect(
            selectLoadedFederation(store.getState(), mockFederation1.id)
                ?.status,
        ).toBe('online')
        expect(
            store.getState().federation.guardianHealth[mockFederation1.id],
        ).toEqual(health)
    })

    it('finishes joining without waiting for guardian probes or a bridge event', async () => {
        const store = setupStore()
        let complete!: (statuses: GuardianStatus[]) => void
        const fedimint = createMockFedimintBridge({
            joinFederation: async () => mockFederation1,
            getGuardianStatus: () =>
                new Promise<GuardianStatus[]>(resolve => {
                    complete = resolve
                }),
        })
        const joined = await store
            .dispatch(joinFederation({ fedimint, code: 'fed1test' }))
            .unwrap()
        expect(joined.id).toBe(mockFederation1.id)
        expect(
            selectLoadedFederation(store.getState(), joined.id)?.status,
        ).toBe('unknown')
        complete(reachable)
        await jest.advanceTimersByTimeAsync(0)
        expect(
            selectLoadedFederation(store.getState(), joined.id)?.status,
        ).toBe('online')
    })
})
