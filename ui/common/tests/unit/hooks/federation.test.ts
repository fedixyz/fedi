import { waitFor } from '@testing-library/react'
import format from 'date-fns/format'
import { t } from 'i18next'

import { theme } from '../../../constants/theme'
import {
    useFederationStatus,
    usePopupFederationInfo,
} from '../../../hooks/federation'
import {
    setFederations,
    setIsInternetUnreachable,
    setupStore,
} from '../../../redux'
import { LoadedFederation } from '../../../types'
import { mockFederation1 } from '../../mock-data/federation'
import { renderHookWithState } from '../../utils/render'

describe('common/hooks/federation', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
    })

    describe('usePopupFederationInfo', () => {
        it('should not show popup info if the federation has no popup info in meta', async () => {
            const { result } = renderHookWithState(
                () => usePopupFederationInfo(mockFederation1?.meta ?? {}),
                store,
            )

            await waitFor(() => {
                expect(result.current).toBe(null)
            })
        })

        it('should correctly display the result of a federation that is ending', async () => {
            const endDateMs = Date.now() + 1000 * 60 * 60
            const formattedEndsAtDate = format(endDateMs, 'LLLL do')
            const endingFederation = { ...mockFederation1 } as LoadedFederation
            endingFederation.meta = {
                // Must be in seconds, not milliseconds
                'fedi:popup_end_timestamp': (endDateMs / 1000).toString(),
                'fedi:popup_countdown_message': 'federation is ending soon',
                'fedi:popup_ended_message': 'federation has ended',
            }
            store.dispatch(setFederations([endingFederation]))
            const { result } = renderHookWithState(
                () => usePopupFederationInfo(endingFederation?.meta ?? {}),
                store,
            )

            await waitFor(() => {
                expect(result.current?.endsInText).toBe('0h 59m 59s')
                expect(result.current?.endsAtText).toBe(formattedEndsAtDate)
                expect(result.current?.ended).toBeFalsy()
                expect(result.current?.endedMessage).toBe(
                    'federation has ended',
                )
                expect(result.current?.countdownMessage).toBe(
                    'federation is ending soon',
                )
            })
        })

        it('should correctly display the result of a federation that has ended', async () => {
            const endDateMs = Date.now() - 1000 * 60 * 60
            const formattedEndsAtDate = format(endDateMs, 'LLLL do')
            const endedFederation = { ...mockFederation1 } as LoadedFederation
            endedFederation.meta = {
                'fedi:popup_end_timestamp': (endDateMs / 1000).toString(),
                'fedi:popup_countdown_message': 'federation is ending soon',
                'fedi:popup_ended_message': 'federation has ended',
            }
            store.dispatch(setFederations([endedFederation]))
            const { result } = renderHookWithState(
                () => usePopupFederationInfo(endedFederation?.meta ?? {}),
                store,
            )

            await waitFor(() => {
                expect(result.current?.endsAtText).toBe(formattedEndsAtDate)
                expect(result.current?.ended).toBeTruthy()
                expect(result.current?.endedMessage).toBe(
                    'federation has ended',
                )
                expect(result.current?.countdownMessage).toBe(
                    'federation is ending soon',
                )
            })
        })
    })

    describe('useFederationStatus', () => {
        it('should correctly display the status for an online federation', async () => {
            store.dispatch(setFederations([mockFederation1]))
            const { result } = renderHookWithState(
                () =>
                    useFederationStatus({
                        federationId: mockFederation1.id,
                        t,
                        statusIconMap: {
                            online: 'Online',
                            offline: 'Offline',
                            unstable: 'Info',
                        },
                    }),
                store,
            )

            expect(result.current.status).toBe('online')
            expect(result.current.statusText).toBe(t('words.status'))
            expect(result.current.statusMessage).toBe(
                t('feature.federations.connection-status-online'),
            )
            expect(result.current.statusIcon).toBe('Online')
            expect(result.current.statusIconColor).toBe(theme.colors.success)
            expect(result.current.statusWord).toBe(t('words.online'))
        })

        it('should correctly display the status for an offline federation', async () => {
            const mockOfflineFederation = {
                ...mockFederation1,
            } as LoadedFederation
            mockOfflineFederation.status = 'offline'
            store.dispatch(setFederations([mockOfflineFederation]))
            const { result } = renderHookWithState(
                () =>
                    useFederationStatus({
                        federationId: mockFederation1.id,
                        t,
                        statusIconMap: {
                            online: 'Online',
                            offline: 'Offline',
                            unstable: 'Info',
                        },
                    }),
                store,
            )

            expect(result.current.status).toBe('offline')
            expect(result.current.statusText).toBe(t('words.status'))
            expect(result.current.statusMessage).toBe(
                t('feature.federations.connection-status-offline'),
            )
            expect(result.current.statusIcon).toBe('Offline')
            expect(result.current.statusIconColor).toBe(theme.colors.red)
            expect(result.current.statusWord).toBe(t('words.offline'))
        })

        it('should correctly display the status for an unstable federation', async () => {
            const mockUnstableFederation = {
                ...mockFederation1,
            } as LoadedFederation
            mockUnstableFederation.status = 'unstable'
            store.dispatch(setFederations([mockUnstableFederation]))
            const { result } = renderHookWithState(
                () =>
                    useFederationStatus({
                        federationId: mockFederation1.id,
                        t,
                        statusIconMap: {
                            online: 'Online',
                            offline: 'Offline',
                            unstable: 'Info',
                        },
                    }),
                store,
            )

            expect(result.current.status).toBe('unstable')
            expect(result.current.statusText).toBe(t('words.status'))
            expect(result.current.statusMessage).toBe(
                t('feature.federations.connection-status-unstable'),
            )
            expect(result.current.statusIcon).toBe('Info')
            expect(result.current.statusIconColor).toBe(
                theme.colors.lightOrange,
            )
            expect(result.current.statusWord).toBe(t('words.unstable'))
        })

        it('should let the user know if they are not connected to the internet', async () => {
            store.dispatch(setFederations([mockFederation1]))
            store.dispatch(setIsInternetUnreachable(true))
            const { result } = renderHookWithState(
                () =>
                    useFederationStatus({
                        federationId: mockFederation1.id,
                        t,
                        statusIconMap: {
                            online: 'Online',
                            offline: 'Offline',
                            unstable: 'Info',
                        },
                    }),
                store,
            )

            expect(result.current.status).toBe('online')
            expect(result.current.statusText).toBe(
                t('feature.federations.last-known-status'),
            )
            expect(result.current.statusMessage).toBe(
                t('feature.federations.please-reconnect'),
            )
            expect(result.current.statusIcon).toBe('Online')
            expect(result.current.statusIconColor).toBe(theme.colors.success)
            expect(result.current.statusWord).toBe(t('words.online'))
        })
    })
})
