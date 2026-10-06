import { act, cleanup } from '@testing-library/react'
import i18n, { t } from 'i18next'

import {
    useFederationStatus,
    useGuardianStatus,
} from '../../../hooks/federation'
import {
    initializeCommonStore,
    setFederations,
    setupStore,
} from '../../../redux'
import type { GuardianStatus } from '../../../types/bindings'
import { mockFederation1 } from '../../mock-data/federation'
import { createMockFedimintBridge } from '../../utils/fedimint'
import { mockStorageApi, renderHookWithBridge } from '../../utils/render'

describe('guardian observations through bridge, store, and hooks', () => {
    let stopMonitoring: (() => void) | undefined

    beforeEach(() => jest.useFakeTimers({ now: 0 }))
    afterEach(() => {
        act(() => stopMonitoring?.())
        stopMonitoring = undefined
        cleanup()
        jest.useRealTimers()
    })

    it('delays a brief warning, shows sustained failure, and recovers after foregrounding', async () => {
        let online = 10
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: async (): Promise<GuardianStatus[]> =>
                Array.from({ length: 10 }, (_, index) =>
                    index < online
                        ? {
                              online: {
                                  guardian: `g${index}`,
                                  fman_name: null,
                                  latency_ms: 10,
                              },
                          }
                        : {
                              timeout: {
                                  guardian: `g${index}`,
                                  fman_name: null,
                                  elapsed: '60s',
                              },
                          },
                ),
        })
        const store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        const { result } = renderHookWithBridge(
            () => ({
                connection: useGuardianStatus(mockFederation1.id),
                status: useFederationStatus({
                    federationId: mockFederation1.id,
                    t,
                    statusIconMap: {
                        online: 'online',
                        unstable: 'unstable',
                        offline: 'offline',
                        unknown: 'unknown',
                    },
                }),
            }),
            store,
            fedimint,
        )
        let active = true
        let foreground!: (active: boolean) => void
        await act(async () => {
            stopMonitoring = initializeCommonStore({
                store,
                fedimint,
                storage: mockStorageApi,
                i18n,
                isForeground: () => active,
                subscribeForeground: callback => {
                    foreground = callback
                    return () => {}
                },
            })
            await jest.advanceTimersByTimeAsync(0)
        })
        const responding = () =>
            result.current.connection.guardians?.filter(g => 'online' in g)
                .length
        expect(responding()).toBe(10)
        expect(result.current.status.statusIcon).toBe('online')

        online = 6
        await act(() => jest.advanceTimersByTimeAsync(35_000))
        expect(responding()).toBe(6)
        expect(result.current.status.statusIcon).toBe('online')
        expect(result.current.status.statusText).toBe(
            t('feature.federations.last-known-status'),
        )
        await act(() => jest.advanceTimersByTimeAsync(210_000))
        expect(responding()).toBe(6)
        expect(result.current.status.statusIcon).toBe('offline')

        act(() => {
            active = false
            foreground(false)
        })
        const calls = fedimint.getGuardianStatus.mock.calls.length
        await act(() => jest.advanceTimersByTimeAsync(180_000))
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(calls)
        expect(result.current.status.statusIcon).toBe('unknown')
        expect(result.current.connection.guardians).toBeUndefined()

        online = 10
        await act(async () => {
            active = true
            foreground(true)
            await jest.advanceTimersByTimeAsync(0)
        })
        expect(responding()).toBe(10)
        expect(result.current.status.statusIcon).toBe('online')
    })
})
