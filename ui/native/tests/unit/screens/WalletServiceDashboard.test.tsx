import {
    act,
    cleanup,
    fireEvent,
    screen,
    userEvent,
    waitFor,
    within,
} from '@testing-library/react-native'
import { ScrollView, StyleSheet } from 'react-native'

import { theme } from '@fedi/common/constants/theme'
import {
    refreshGuardianStatuses,
    setFederations,
    setFaFederationJoin,
    setFaStatus,
    setReplacementCandidates,
    setFaLiquidityOperation,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { MSats } from '@fedi/common/types'
import type {
    FeatureCatalog,
    GuardianStatus,
    RpcFaFormationSnapshot,
    RpcFaFormedFederation,
    RpcFaFormedSeat,
    RpcFaGuardianTransfer,
    RpcFaGuardianTransferResult,
    RpcFaLiquidityOperation,
    RpcFaReplacementCheck,
    RpcFaStatus,
} from '@fedi/common/types/bindings'
import { guardianQuorum } from '@fedi/common/utils/federationHealth'

import i18n from '../../../localization/i18n'
import WalletServiceDashboard from '../../../screens/WalletServiceDashboard'
import { reset } from '../../../state/navigation'
import {
    mockHardwareBack,
    mockNavigation,
    mockRoute,
} from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const WALLET_SERVICE_FEDERATION_ID = 'wallet-service-federation'
const INVITE_CODE = 'fed11invitecode'

/**
 * The tour measures its targets through `measureInWindow`, which the test
 * renderer does not implement, so it is stubbed here and asserted through the
 * props the screen hands it.
 */
const mockTourRender = jest.fn()

/**
 * The support hook is mocked rather than the Zendesk module beneath it, same
 * as `WalletServiceProgress.test.tsx`: this screen's contract is "the support
 * action opens support", not how `useLaunchZendesk` gets there.
 */
const mockLaunchZendesk = jest.fn()
jest.mock('../../../utils/hooks/support', () => ({
    useLaunchZendesk: () => ({ launchZendesk: mockLaunchZendesk }),
}))

jest.mock(
    '../../../components/feature/walletservice/WalletServiceTour',
    () => ({
        WalletServiceTour: (props: {
            show: boolean
            onLastStep: () => void
            onDone: () => void
        }) => {
            mockTourRender(props)
            return null
        },
    }),
)

/** Records every guardian status fetch the screen makes. */
const mockGuardianStatusCalls = jest.fn()

/** Records every guardian move subscribe the screen opens. */
const mockTransferSubscribe = jest.fn()

/** Sends an item on the open guardian move stream, as the bridge does. */
let emitTransfer: (result: RpcFaGuardianTransferResult) => void = () => {
    throw new Error('no guardian move stream open')
}

/** Records every guardian remittance balance subscribe the screen opens. */
const mockFeeBalanceSubscribe = jest.fn()

/** Records every replacement candidates subscribe the screen opens. */
const mockCandidatesSubscribe = jest.fn()

const makeGuardianStatuses = (
    online: number,
    total: number,
): GuardianStatus[] => [
    ...Array.from({ length: online }, (_, i) => ({
        online: { guardian: `g${i}`, mg_name: null, latency_ms: 50 },
    })),
    ...Array.from({ length: total - online }, (_, i) => ({
        timeout: { guardian: `g${online + i}`, mg_name: null, elapsed: '5s' },
    })),
]

const makeSeats = (count: number): RpcFaFormedSeat[] =>
    Array.from({ length: count }, (_, index) => ({
        mgId: `mg-${index}`,
        mgName: `guardian ${index}`,
        seatId: `seat-${index}`,
        locator: `locator-${index}`,
    }))

/** A federation formed by a formation on this device. */
const federation: RpcFaFormedFederation = {
    formationId: 'formation-1',
    federationInvite: INVITE_CODE,
    federationName: 'Test Wallet Service',
    seats: makeSeats(7),
    freshness: 'fresh',
    backupEligible: true,
    origin: 'thisDevice',
}

/** The setup that formed `formed`, as this app watched it. */
const formationOf = (
    formed: RpcFaFormedFederation,
): RpcFaFormationSnapshot => ({
    formationId: formed.formationId,
    phase: 'publishingSeatBindings',
    intent: {
        federationName: formed.federationName ?? '',
        federationSize: formed.seats.length,
        guardianFeePpm: 1_000,
        plan: 'infiniteBestEffort',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: true,
    milestones: { ecashSent: true, guardiansConfirmed: true },
    inviteCode: formed.federationInvite,
    lastError: null,
})

/** Matches the fixture in `common/tests/unit/hooks/faRecoveryStage.test.ts`. */
const restoredStatus = (
    freshness: 'unsynced' | 'fresh',
    backupEligible = false,
): RpcFaStatus => ({
    type: 'formed',
    federation: {
        formationId: 'formation-1',
        federationInvite: INVITE_CODE,
        federationName: 'Restored Wallet Service',
        seats: [],
        freshness,
        backupEligible,
        origin: 'backup',
    },
})

const transferFlags = (isEnabled: boolean) =>
    (isEnabled
        ? { wallet_service_guardian_transfer: {} }
        : {}) as FeatureCatalog

const renderScreen = ({
    // a federation this app watched form; `status` replaces it with one it
    // did not: a backup import takes the restore flow, and a federation
    // formed in an earlier launch does not
    formed = federation,
    // the federation the invite resolves to is joined and loaded, matching
    // the bridge's auto-join once formation reaches `formed`
    federationJoined = true,
    // the joined federation is the wallet service, so it publishes the live
    // name; that equals the creation-time name until a rename
    federationName = federation.federationName ?? '',
    renamedTo = null as string | null,
    iconUrl = null as string | null,
    // what the guardian remittance balance stream does: a number it emits, or
    // one of the two states it can be left in
    feeBalance = 0 as number | 'pending' | 'error',
    guardianStatuses = null as GuardianStatus[] | null,
    refreshedGuardianStatuses = null as GuardianStatus[] | null,
    hasSeenTour = true,
    // what the app-wide monitor has found; the dashboard is where a user lands
    // after walking away from an attach, so it has to report one
    liquidity = null as RpcFaLiquidityOperation | null,
    status,
    recovering = false,
    isTransferEnabled = true,
    // what the guardian move stream sends first; `null` is no move open
    guardianTransfer = null as RpcFaGuardianTransfer | null,
    routeParams = undefined as { openSheet?: 'guardians' } | undefined,
    // the check the candidates stream answers with; `null` is none run yet
    replacementCheck = null as RpcFaReplacementCheck | null,
}: {
    formed?: RpcFaFormedFederation
    federationJoined?: boolean
    federationName?: string
    renamedTo?: string | null
    iconUrl?: string | null
    feeBalance?: number | 'pending' | 'error'
    guardianStatuses?: GuardianStatus[] | null
    refreshedGuardianStatuses?: GuardianStatus[] | null
    hasSeenTour?: boolean
    liquidity?: RpcFaLiquidityOperation | null
    status?: RpcFaStatus
    recovering?: boolean
    isTransferEnabled?: boolean
    guardianTransfer?: RpcFaGuardianTransfer | null
    routeParams?: { openSheet?: 'guardians' }
    replacementCheck?: RpcFaReplacementCheck | null
} = {}) => {
    const state = setupStore().getState()
    const fedimint = createMockFedimintBridge({
        parseInviteCode: async () => ({
            federationId: WALLET_SERVICE_FEDERATION_ID,
        }),
        getGuardianStatus: async () => {
            const statuses =
                mockGuardianStatusCalls.mock.calls.length > 0
                    ? (refreshedGuardianStatuses ?? guardianStatuses)
                    : guardianStatuses
            mockGuardianStatusCalls()
            return statuses ?? []
        },
        spv2GuardianRemittanceBalance: (args: {
            federationId: string
            callback: (balance: MSats) => void
            onError?: (error: unknown) => void
        }) => {
            mockFeeBalanceSubscribe(args.federationId)
            if (feeBalance === 'error')
                args.onError?.(new Error('stream refused'))
            else if (feeBalance !== 'pending')
                args.callback(feeBalance as unknown as MSats)
            return () => {}
        },
        faClientSubscribeGuardianTransfer: (args: {
            callback: (result: RpcFaGuardianTransferResult) => void
        }) => {
            mockTransferSubscribe()
            emitTransfer = args.callback
            args.callback({ type: 'transfer', transfer: guardianTransfer })
            return () => {}
        },
        faClientSubscribeReplacementCandidates: (args: {
            callback: (candidates: {
                type: 'ready'
                check: RpcFaReplacementCheck | null
            }) => void
        }) => {
            mockCandidatesSubscribe()
            args.callback({ type: 'ready', check: replacementCheck })
            return () => {}
        },
    })

    const store = setupStore({
        environment: {
            ...state.environment,
            featureFlags: transferFlags(isTransferEnabled),
        },
        federation: {
            ...state.federation,
            federations: federationJoined
                ? [
                      {
                          ...mockFederation1,
                          id: WALLET_SERVICE_FEDERATION_ID,
                          name: federationName,
                          meta: {
                              ...(renamedTo
                                  ? { federation_name: renamedTo }
                                  : mockFederation1.meta),
                              ...(iconUrl && {
                                  'fedi:federation_icon_url': iconUrl,
                              }),
                          },
                          // the screen no longer reads this; it is here
                          // so a personal balance cannot silently
                          // become what the card shows again
                          balance: 21_000_000 as MSats,
                          recovering,
                      },
                  ]
                : [],
        },
        fi: {
            status: null,
            clientError: null,
            federationJoin: null,
            creationHighWaterMark: null,
            walletServiceMetadata: {
                formationId: null,
                published: null,
                holds: {},
                status: 'idle',
                latestRequestId: null,
            },
            draft: { name: '', size: 10 },
            selectionPreview: null,
            replacementPreview: null,
            transferDestinationPreview: null,
            guardianTransfer: undefined,
            replacementCheck: null,
            topUpInvoice: null,
            eligiblePayers: null,
            payerError: null,
            operationError: null,
            liquidity: {
                operation: liquidity,
                hasRead: true,
                errorCode: null,
                isRequesting: false,
            },
        },
        nux: {
            steps: {
                ...state.nux.steps,
                hasSeenWalletServiceTour: hasSeenTour,
            },
        },
    })
    if (status) {
        store.dispatch(setFaStatus(status))
    } else {
        // the same two reports the app gets: the formation, then the
        // federation it formed, so the store records that it watched it form
        store.dispatch(
            setFaStatus({ type: 'formation', formation: formationOf(formed) }),
        )
        store.dispatch(setFaStatus({ type: 'formed', federation: formed }))
    }

    return renderWithProviders(
        <WalletServiceDashboard
            navigation={mockNavigation as any}
            route={{ ...mockRoute, params: routeParams } as any}
        />,
        { fedimint, store },
    )
}

const runningAttach = (
    overrides: Partial<RpcFaLiquidityOperation> = {},
): RpcFaLiquidityOperation =>
    ({
        operationId: 'operation-1',
        formationId: 'formation-1',
        providerPubkey: 'pubkey-1',
        endpointHint: '',
        detailsPayloadHash: 'hash',
        amounts: {
            gatewayMinSats: 100_000,
            gatewayMaxSats: 1_000_000,
            stabilityMinSats: 0,
            stabilityMaxSats: null,
        },
        phase: 'accepted',
        itemStatuses: [],
        rejectionCode: null,
        gatewayViewVerified: false,
        ...overrides,
    }) as RpcFaLiquidityOperation

/** Props the mocked tour was last rendered with. */
const lastTourProps = () =>
    mockTourRender.mock.calls[mockTourRender.mock.calls.length - 1][0]

describe('screens/WalletServiceDashboard', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        mockHardwareBack.reset()
    })

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should show the service name and the guardian count while status is unknown', async () => {
        renderScreen({ federationJoined: false })
        // let the invite-code parse (unused here, since the federation never
        // loads) settle so it isn't left pending across the test boundary
        await waitFor(() => {})

        expect(screen.getByText('Test Wallet Service')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.dashboard-guardian-count', {
                    total: 7,
                }),
            ),
        ).toBeOnTheScreen()
    })

    it('should show the name the federation publishes after a rename', async () => {
        renderScreen({ renamedTo: 'Money Badger' })
        await waitFor(() => {})

        expect(screen.getByText('Money Badger')).toBeOnTheScreen()
        expect(screen.queryByText('Test Wallet Service')).toBeNull()
    })

    it('should draw the icon the service publishes in the hero', async () => {
        renderScreen({ iconUrl: 'https://example.com/icon.svg' })
        await waitFor(() => {})

        expect(screen.getByTestId('FederationLogo__Image-svg').props.uri).toBe(
            'https://example.com/icon.svg',
        )
        expect(
            screen.queryByTestId('WalletServiceDashboard__HeroMark'),
        ).toBeNull()
    })

    it('should stand in with the wallet mark when the service publishes no icon', async () => {
        renderScreen()
        await waitFor(() => {})

        expect(
            screen.getByTestId('WalletServiceDashboard__HeroMark'),
        ).toBeOnTheScreen()
    })

    it('should stand in with the wallet mark when the published icon cannot be loaded', async () => {
        renderScreen({ iconUrl: 'https://example.com/missing.png' })
        // `FederationLogo` resets its fallback in an effect keyed on the url.
        // Firing the error before that effect has flushed lets the reset land
        // after it and the mark never appears — wait for the image itself, so
        // the render that carries the url is committed and its effect run.
        const image = await screen.findByTestId('FederationLogo__Image')

        act(() => {
            fireEvent(image, 'error')
        })

        expect(
            screen.getByTestId('WalletServiceDashboard__HeroMark'),
        ).toBeOnTheScreen()
        expect(screen.queryByTestId('FederationLogo__Image')).toBeNull()
    })

    it('should take the guardian total from the formed seats', async () => {
        renderScreen({
            formed: { ...federation, seats: makeSeats(13) },
            federationJoined: false,
        })
        await waitFor(() => {})

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.dashboard-guardian-count', {
                    total: 13,
                }),
            ),
        ).toBeOnTheScreen()
    })

    const guardiansCount = (online: number, total: number) =>
        i18n.t('feature.wallet-service.guardians-count', { online, total })

    const dotColor = (testID: string) =>
        StyleSheet.flatten(screen.getByTestId(testID).props.style)
            .backgroundColor

    const offlineMessage = (total: number) =>
        i18n.t('feature.wallet-service.federation-offline', {
            quorum: guardianQuorum(total),
            total,
        })

    const sustain = async (
        store: ReturnType<typeof renderScreen>['store'],
        statuses: GuardianStatus[],
        seconds: number,
    ) => {
        const initial =
            store.getState().federation.guardianHealth[
                WALLET_SERVICE_FEDERATION_ID
            ]?.checkedAt
        if (initial === undefined) throw new Error('missing observation')
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: async () => statuses,
        })
        const now = jest.spyOn(Date, 'now')
        try {
            for (let elapsed = 35; elapsed <= seconds; elapsed += 35) {
                now.mockReturnValue(initial + elapsed * 1000)
                await act(async () => {
                    await store.dispatch(
                        refreshGuardianStatuses({
                            fedimint,
                            federation: {
                                ...mockFederation1,
                                id: WALLET_SERVICE_FEDERATION_ID,
                            },
                        }),
                    )
                })
            }
        } finally {
            now.mockRestore()
        }
        return initial + Math.floor(seconds / 35) * 35_000
    }

    it('should show a live guardian count once the federation is joined and all guardians are online', async () => {
        renderScreen({ guardianStatuses: makeGuardianStatuses(7, 7) })

        expect(await screen.findByText(guardiansCount(7, 7))).toBeOnTheScreen()
        expect(dotColor('wallet-service-status-dot')).toBe(theme.colors.success)
    })

    it('should not call a federation offline after one partial guardian result', async () => {
        renderScreen({ guardianStatuses: makeGuardianStatuses(2, 7) })

        expect(await screen.findByText(guardiansCount(2, 7))).toBeOnTheScreen()
        expect(dotColor('wallet-service-status-dot')).toBe(theme.colors.grey)
        expect(screen.queryByText(offlineMessage(7))).not.toBeOnTheScreen()
    })

    it.each([
        [4, 210, theme.colors.red],
        [5, 385, theme.colors.lightOrange],
        [6, 385, theme.colors.success],
    ] as const)(
        'should colour the status dot after sustained %i of seven reachability',
        async (online, seconds, color) => {
            const statuses = makeGuardianStatuses(online, 7)
            const { store } = renderScreen({ guardianStatuses: statuses })
            await screen.findByText(guardiansCount(online, 7))

            await sustain(store, statuses, seconds)

            expect(dotColor('wallet-service-status-dot')).toBe(color)
        },
    )

    it('should warn under the withdraw button once the federation is offline', async () => {
        const statuses = makeGuardianStatuses(4, 7)
        const { store } = renderScreen({ guardianStatuses: statuses })
        await screen.findByText(guardiansCount(4, 7))

        await sustain(store, statuses, 210)

        expect(screen.getByText(offlineMessage(7))).toBeOnTheScreen()
    })

    it('should list guardians that are not responding first, then the rest in seat order', async () => {
        renderScreen({
            guardianStatuses: [
                {
                    online: {
                        guardian: 'g0',
                        mg_name: 'Alice',
                        latency_ms: 50,
                    },
                },
                {
                    error: {
                        guardian: 'g1',
                        mg_name: 'Bob',
                        error: 'refused',
                    },
                },
                {
                    online: {
                        guardian: 'g2',
                        mg_name: 'Carol',
                        latency_ms: 50,
                    },
                },
                {
                    timeout: {
                        guardian: 'g3',
                        mg_name: 'Dave',
                        elapsed: '10s',
                    },
                },
            ],
        })

        await user.press(await screen.findByTestId('wallet-service-guardians'))

        const row = (index: number) =>
            within(screen.getByTestId(`wallet-service-guardian-${index}`))
        // the section names the state, so each row shows it by its dot only
        expect(row(0).getByText('Bob')).toBeOnTheScreen()
        expect(dotColor('wallet-service-guardian-0-dot')).toBe(
            theme.colors.grey,
        )
        expect(row(1).getByText('Dave')).toBeOnTheScreen()
        expect(dotColor('wallet-service-guardian-1-dot')).toBe(
            theme.colors.grey,
        )
        expect(row(2).getByText('Alice')).toBeOnTheScreen()
        expect(dotColor('wallet-service-guardian-2-dot')).toBe(
            theme.colors.success,
        )
        expect(row(3).getByText('Carol')).toBeOnTheScreen()
        expect(dotColor('wallet-service-guardian-3-dot')).toBe(
            theme.colors.success,
        )
        expect(screen.queryByText('Not responding')).not.toBeOnTheScreen()
        expect(screen.queryByText('Online')).not.toBeOnTheScreen()
    })

    describe('replacing a guardian from the list', () => {
        const seat = (index: number, mgName: string): RpcFaFormedSeat => ({
            mgId: `mg-${index}`,
            mgName,
            locator: `locator-${index}`,
            seatId: `seat-${index}`,
        })
        const namedFederation: RpcFaFormedFederation = {
            ...federation,
            seats: [seat(0, 'Alice'), seat(1, 'Bob'), seat(2, 'Carol')],
        }
        // Carol is seat 2 but lists first, as the one not responding, so a
        // button that sent the row position would send 0
        const carolDown: GuardianStatus[] = [
            { online: { guardian: 'g0', mg_name: 'Alice', latency_ms: 50 } },
            { online: { guardian: 'g1', mg_name: 'Bob', latency_ms: 50 } },
            { timeout: { guardian: 'g2', mg_name: 'Carol', elapsed: '10s' } },
        ]
        // the check flags Carol only: Bob going quiet later is not a reason
        const carolFlagged: RpcFaReplacementCheck = {
            federationId: WALLET_SERVICE_FEDERATION_ID,
            checkedAt: 1_700_000_000,
            blockingLiquidityOperation: null,
            candidates: [
                {
                    seatIndex: 2,
                    mgId: 'mg-2',
                    mgName: 'Carol',
                    reasons: [
                        { type: 'lowWeekScore', basisPoints: 6_250 },
                        { type: 'missedSessions', sessions: 4 },
                    ],
                },
            ],
        }
        const openSheet = async () =>
            user.press(await screen.findByTestId('wallet-service-guardians'))

        it('should keep Replace blocked until the replacement check clears it', async () => {
            const { store } = renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: {
                    ...carolFlagged,
                    blockingLiquidityOperation: 'operation-1',
                },
            })
            await openSheet()
            const replace = screen.getByTestId(
                'wallet-service-guardian-replace-2',
            )
            expect(replace).toBeDisabled()
            expect(
                screen.getByText(/blocked by an unfinished liquidity request/),
            ).toBeOnTheScreen()
            await user.press(replace)
            expect(mockNavigation.navigate).not.toHaveBeenCalled()
            act(() => {
                store.dispatch(
                    setFaLiquidityOperation(
                        runningAttach({ gatewayViewVerified: true }),
                    ),
                )
            })
            expect(replace).toBeDisabled()
            act(() => {
                store.dispatch(
                    setReplacementCandidates({
                        type: 'ready',
                        check: carolFlagged,
                    }),
                )
            })
            expect(replace).toBeEnabled()
        })

        it('should show why a flagged guardian is flagged before opening the replacement for its seat', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
            })
            await openSheet()
            const replace = await screen.findByTestId(
                'wallet-service-guardian-replace-2',
            )
            expect(
                within(
                    screen.getByTestId('wallet-service-guardian-0'),
                ).getByText('Carol'),
            ).toBeOnTheScreen()

            await user.press(replace)

            // the reasons come first; nothing is priced yet
            expect(mockNavigation.navigate).not.toHaveBeenCalled()
            const reasons = await screen.findByTestId(
                'wallet-service-replace-reasons',
            )
            // label and number apart, as the setup flow's summaries read
            expect(
                within(reasons).getByText('Uptime, last 7 days'),
            ).toBeOnTheScreen()
            expect(within(reasons).getByText('62%')).toBeOnTheScreen()
            expect(
                within(reasons).getByText('Offline checks in a row'),
            ).toBeOnTheScreen()
            expect(within(reasons).getByText('4')).toBeOnTheScreen()

            await user.press(
                screen.getByTestId('wallet-service-replace-get-quote'),
            )

            expect(mockNavigation.navigate).toHaveBeenCalledTimes(1)
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceGuardianTransfer',
                { seatIndex: 2 },
            )
        })

        it('should group the guardians by what they need, with the most telling reason under a flagged one', async () => {
            renderScreen({
                formed: namedFederation,
                // Bob is down but not flagged, Carol is flagged
                guardianStatuses: [
                    carolDown[0],
                    {
                        timeout: {
                            guardian: 'g1',
                            mg_name: 'Bob',
                            elapsed: '10s',
                        },
                    },
                    carolDown[2],
                ],
                replacementCheck: carolFlagged,
            })
            await openSheet()
            await screen.findByTestId('wallet-service-guardian-replace-2')

            const row = (index: number) =>
                within(screen.getByTestId(`wallet-service-guardian-${index}`))
            expect(row(0).getByText('Carol')).toBeOnTheScreen()
            // the week's uptime, not the missed sessions listed after it
            expect(
                row(0).getByText('Online 62% of the last week'),
            ).toBeOnTheScreen()
            expect(row(0).queryByText(/checks$/)).not.toBeOnTheScreen()
            expect(row(1).getByText('Bob')).toBeOnTheScreen()
            expect(row(2).getByText('Alice')).toBeOnTheScreen()
            for (const key of [
                'feature.wallet-service.guardians-section-needs-replacing',
                'feature.wallet-service.guardians-section-not-responding',
                'feature.wallet-service.guardians-section-healthy',
            ] as const)
                expect(
                    screen.getByText(i18n.t(key).toUpperCase()),
                ).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t(
                        'feature.wallet-service.guardians-section-replacing',
                    ),
                ),
            ).not.toBeOnTheScreen()
        })

        it('should show missed sessions rather than the last time seen when those are the reasons', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: {
                    ...carolFlagged,
                    candidates: [
                        {
                            ...carolFlagged.candidates[0],
                            reasons: [
                                {
                                    type: 'offline',
                                    lastSeenSecs: 1_700_000_000,
                                },
                                { type: 'missedSessions', sessions: 14 },
                            ],
                        },
                    ],
                },
            })
            await openSheet()
            await screen.findByTestId('wallet-service-guardian-replace-2')

            const carol = within(
                screen.getByTestId('wallet-service-guardian-0'),
            )
            expect(
                carol.getByText('Offline for the last 14 checks'),
            ).toBeOnTheScreen()
            expect(carol.queryByText(/Last seen/)).not.toBeOnTheScreen()
        })

        it('should list the guardian an open replacement moves off as being replaced, with no Replace', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
                guardianTransfer: {
                    seatIndex: 2,
                    sourceMgId: 'mg-2',
                    sourceMgName: 'Carol',
                    sourceSeatId: 'seat-2',
                    destinationMgId: 'mg-new',
                    destinationMgName: 'Dave',
                    destinationSeatId: 'seat-new',
                    phase: 'awaitingSource',
                },
            })
            await openSheet()

            const carol = within(
                await screen.findByTestId('wallet-service-guardian-0'),
            )
            expect(carol.getByText('Carol')).toBeOnTheScreen()
            // a spinner in place of the status dot
            expect(carol.getByTestId('milestone-spinner')).toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-0-dot'),
            ).not.toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n
                        .t('feature.wallet-service.guardians-section-replacing')
                        .toUpperCase(),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-2'),
            ).not.toBeOnTheScreen()
        })

        it('should go back to the list from the reasons without opening anything', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
            })
            await openSheet()
            await user.press(
                await screen.findByTestId('wallet-service-guardian-replace-2'),
            )
            await user.press(
                await screen.findByTestId('wallet-service-replace-not-now'),
            )

            expect(
                await screen.findByTestId('wallet-service-guardian-replace-2'),
            ).toBeOnTheScreen()
            expect(mockNavigation.navigate).not.toHaveBeenCalled()
        })

        it('should offer a replacement only for a guardian the check flagged', async () => {
            // Bob and Carol are both down, but only Carol is flagged
            renderScreen({
                formed: namedFederation,
                guardianStatuses: [
                    carolDown[0],
                    {
                        timeout: {
                            guardian: 'g1',
                            mg_name: 'Bob',
                            elapsed: '10s',
                        },
                    },
                    carolDown[2],
                ],
                replacementCheck: carolFlagged,
            })
            await openSheet()
            await screen.findByTestId('wallet-service-guardian-replace-2')

            expect(
                screen.queryByTestId('wallet-service-guardian-replace-0'),
            ).not.toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-1'),
            ).not.toBeOnTheScreen()
            // Bob, down but not flagged, is told when he can be replaced
            expect(
                within(
                    screen.getByTestId('wallet-service-guardian-1'),
                ).getByText(
                    i18n.t(
                        'feature.wallet-service.guardian-not-responding-detail',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(mockTransferSubscribe).toHaveBeenCalledTimes(1)
        })

        it('should not offer a replacement for a guardian that is down before any check flags it', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
            })
            await openSheet()

            expect(
                await screen.findByTestId('wallet-service-guardian-0'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-2'),
            ).not.toBeOnTheScreen()
            expect(mockCandidatesSubscribe).toHaveBeenCalled()
        })

        it('should not offer a replacement while another move is open', async () => {
            const { store } = renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
                guardianTransfer: {
                    seatIndex: 1,
                    sourceMgId: 'mg-1',
                    sourceMgName: 'Bob',
                    sourceSeatId: 'seat-1',
                    destinationMgId: 'mg-new',
                    destinationMgName: 'Dave',
                    destinationSeatId: null,
                    phase: 'buyingSeat',
                },
            })
            await openSheet()

            await waitFor(() =>
                expect(store.getState().fi.guardianTransfer?.phase).toBe(
                    'buyingSeat',
                ),
            )
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-2'),
            ).not.toBeOnTheScreen()
        })

        it('should not offer a replacement with the feature flag off', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
                isTransferEnabled: false,
            })
            await openSheet()

            expect(
                await screen.findByTestId('wallet-service-guardian-0'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-2'),
            ).not.toBeOnTheScreen()
            expect(mockTransferSubscribe).not.toHaveBeenCalled()
            expect(mockCandidatesSubscribe).not.toHaveBeenCalled()
        })

        it('should not offer a replacement before the service is formed', async () => {
            renderScreen({
                status: {
                    type: 'formation',
                    formation: {
                        ...formationOf(namedFederation),
                        phase: 'acquiringSeats',
                    },
                },
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
            })
            await openSheet()

            expect(
                await screen.findByTestId('wallet-service-guardian-0'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-2'),
            ).not.toBeOnTheScreen()
            expect(mockTransferSubscribe).not.toHaveBeenCalled()
        })

        it('should not offer a replacement when two seats share the name', async () => {
            renderScreen({
                formed: {
                    ...namedFederation,
                    seats: [
                        seat(0, 'Alice'),
                        seat(1, 'Carol'),
                        seat(2, 'Carol'),
                    ],
                },
                // the peers publish the same names the seats derive
                guardianStatuses: [
                    carolDown[0],
                    {
                        online: {
                            guardian: 'g1',
                            mg_name: 'Carol',
                            latency_ms: 50,
                        },
                    },
                    carolDown[2],
                ],
                replacementCheck: carolFlagged,
            })
            await openSheet()

            expect(
                await screen.findByTestId('wallet-service-guardian-0'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-1'),
            ).not.toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-guardian-replace-2'),
            ).not.toBeOnTheScreen()
        })

        it('should open the guardian list when asked to, once the push has landed', async () => {
            const transitionEnds: ((e: {
                data: { closing: boolean }
            }) => void)[] = []
            const unsubscribe = jest.fn()
            mockNavigation.addListener.mockImplementationOnce(((
                type: string,
                listener: (e: { data: { closing: boolean } }) => void,
            ) => {
                if (type === 'transitionEnd') transitionEnds.push(listener)
                return unsubscribe
            }) as never)
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
                routeParams: { openSheet: 'guardians' },
            })
            // the statuses have landed, so only the push holds the sheet back
            await waitFor(() =>
                expect(mockGuardianStatusCalls).toHaveBeenCalled(),
            )
            await act(async () => {})
            expect(
                screen.queryByTestId('wallet-service-guardian-0'),
            ).not.toBeOnTheScreen()

            act(() => {
                for (const l of transitionEnds) l({ data: { closing: true } })
            })
            expect(
                screen.queryByTestId('wallet-service-guardian-0'),
            ).not.toBeOnTheScreen()

            act(() => {
                for (const l of transitionEnds) l({ data: { closing: false } })
            })

            expect(
                await screen.findByTestId('wallet-service-guardian-replace-2'),
            ).toBeOnTheScreen()
            // once only: returning from the move must not reopen it
            expect(unsubscribe).toHaveBeenCalled()
        })

        it('should say on the dashboard which guardian the check flagged and open the list from it', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
            })
            const banner = await screen.findByTestId(
                'wallet-service-replacement-banner',
            )
            expect(
                within(banner).getByText('1 guardian needs replacing'),
            ).toBeOnTheScreen()
            expect(
                within(banner).getByText(/flagged Carol as unreliable/),
            ).toBeOnTheScreen()

            await user.press(banner)

            expect(
                await screen.findByTestId('wallet-service-guardian-replace-2'),
            ).toBeOnTheScreen()
            expect(mockNavigation.navigate).not.toHaveBeenCalled()
        })

        it('should say members cannot pay once the federation is below quorum, and not before', async () => {
            const statuses: GuardianStatus[] = [
                carolDown[0],
                { timeout: { guardian: 'g1', mg_name: 'Bob', elapsed: '10s' } },
                carolDown[2],
            ]
            const { store } = renderScreen({
                formed: namedFederation,
                guardianStatuses: statuses,
                replacementCheck: carolFlagged,
            })
            const banner = await screen.findByTestId(
                'wallet-service-replacement-banner',
            )
            const belowQuorum = i18n.t(
                'feature.wallet-service.replace-banner-body-below-quorum',
            )
            // one probe under quorum is not yet an offline federation
            expect(
                within(banner).getByText(/flagged Carol as unreliable/),
            ).toBeOnTheScreen()
            expect(
                within(banner).queryByText(belowQuorum),
            ).not.toBeOnTheScreen()
            // the streamed move can show the banner before the first probe
            // lands, and sustaining starts from that probe
            await waitFor(() =>
                expect(
                    store.getState().federation.guardianHealth[
                        WALLET_SERVICE_FEDERATION_ID
                    ],
                ).toBeDefined(),
            )

            await sustain(store, statuses, 210)

            const sustained = screen.getByTestId(
                'wallet-service-replacement-banner',
            )
            expect(within(sustained).getByText(belowQuorum)).toBeOnTheScreen()
            expect(
                within(sustained).getByText('Review guardians ›'),
            ).toBeOnTheScreen()
            expect(dotColor('wallet-service-status-dot')).toBe(theme.colors.red)
        })

        it('should say who is being paid while the new host is bought', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
                guardianTransfer: {
                    seatIndex: 2,
                    sourceMgId: 'mg-2',
                    sourceMgName: 'Carol',
                    sourceSeatId: 'seat-2',
                    destinationMgId: 'mg-new',
                    destinationMgName: 'Dave',
                    destinationSeatId: 'seat-new',
                    phase: 'buyingSeat',
                },
            })
            const banner = await screen.findByTestId(
                'wallet-service-replacement-progress',
            )
            expect(within(banner).getByText('Paying Dave…')).toBeOnTheScreen()
        })

        it('should not name the only group of guardians', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: [
                    carolDown[0],
                    carolDown[1],
                    {
                        online: {
                            guardian: 'g2',
                            mg_name: 'Carol',
                            latency_ms: 50,
                        },
                    },
                ],
                replacementCheck: { ...carolFlagged, candidates: [] },
            })
            await openSheet()
            await screen.findByTestId('wallet-service-guardian-2')

            expect(
                screen.queryByText(
                    i18n
                        .t('feature.wallet-service.guardians-section-healthy')
                        .toUpperCase(),
                ),
            ).not.toBeOnTheScreen()
        })

        it('should not show the banner while no guardian is flagged', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: { ...carolFlagged, candidates: [] },
            })
            await screen.findByTestId('wallet-service-guardians')
            await waitFor(() =>
                expect(mockCandidatesSubscribe).toHaveBeenCalled(),
            )

            expect(
                screen.queryByTestId('wallet-service-replacement-banner'),
            ).not.toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-replacement-progress'),
            ).not.toBeOnTheScreen()
        })

        it('should follow the replacement the stream reports and drop it once completed', async () => {
            const carolMove: RpcFaGuardianTransfer = {
                seatIndex: 2,
                sourceMgId: 'mg-2',
                sourceMgName: 'Carol',
                sourceSeatId: 'seat-2',
                destinationMgId: 'mg-new',
                destinationMgName: 'Dave',
                destinationSeatId: 'seat-new',
                phase: 'awaitingSource',
            }
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
            })
            await screen.findByTestId('wallet-service-replacement-banner')
            expect(
                screen.queryByTestId('wallet-service-replacement-progress'),
            ).not.toBeOnTheScreen()

            act(() => emitTransfer({ type: 'transfer', transfer: carolMove }))
            const banner = await screen.findByTestId(
                'wallet-service-replacement-progress',
            )
            expect(
                within(banner).getByText('Waiting for Carol to come online.'),
            ).toBeOnTheScreen()

            // an error says nothing about the move, so it stays up
            act(() =>
                emitTransfer({
                    type: 'error',
                    error: {
                        code: 'storage',
                        message: 'read failed',
                        detail: null,
                    },
                }),
            )
            expect(
                screen.getByTestId('wallet-service-replacement-progress'),
            ).toBeOnTheScreen()

            act(() =>
                emitTransfer({
                    type: 'transfer',
                    transfer: { ...carolMove, phase: 'completed' },
                }),
            )
            await waitFor(() =>
                expect(
                    screen.queryByTestId('wallet-service-replacement-progress'),
                ).not.toBeOnTheScreen(),
            )
            expect(mockTransferSubscribe).toHaveBeenCalledTimes(1)
        })

        it('should show an open replacement instead of the flagged list and open it', async () => {
            renderScreen({
                formed: namedFederation,
                guardianStatuses: carolDown,
                replacementCheck: carolFlagged,
                guardianTransfer: {
                    seatIndex: 2,
                    sourceMgId: 'mg-2',
                    sourceMgName: 'Carol',
                    sourceSeatId: 'seat-2',
                    destinationMgId: 'mg-new',
                    destinationMgName: 'Dave',
                    destinationSeatId: 'seat-new',
                    phase: 'awaitingSource',
                },
            })
            const banner = await screen.findByTestId(
                'wallet-service-replacement-progress',
            )
            expect(
                within(banner).getByText('Replacing Carol'),
            ).toBeOnTheScreen()
            expect(
                within(banner).getByText('Waiting for Carol to come online.'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('wallet-service-replacement-banner'),
            ).not.toBeOnTheScreen()

            await user.press(banner)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceGuardianTransfer',
            )
        })
    })

    it('should name a guardian by its seat while its manifold guardian name is unknown', async () => {
        renderScreen({ guardianStatuses: makeGuardianStatuses(2, 3) })

        await user.press(await screen.findByTestId('wallet-service-guardians'))

        expect(
            within(screen.getByTestId('wallet-service-guardian-0')).getByText(
                i18n.t('feature.wallet-service.guardian-fallback-name', {
                    number: 3,
                }),
            ),
        ).toBeOnTheScreen()
        expect(screen.queryByText('g2')).not.toBeOnTheScreen()
    })

    it('should say the federation is online when every guardian responds', async () => {
        renderScreen({ guardianStatuses: makeGuardianStatuses(7, 7) })

        await user.press(await screen.findByTestId('wallet-service-guardians'))

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.federation-online'),
            ),
        ).toBeOnTheScreen()
    })

    it('should say how many guardians the federation needs while some are not responding', async () => {
        renderScreen({ guardianStatuses: makeGuardianStatuses(9, 10) })

        await user.press(await screen.findByTestId('wallet-service-guardians'))

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.federation-online-degraded', {
                    quorum: 7,
                    total: 10,
                }),
            ),
        ).toBeOnTheScreen()
    })

    it('should not call the federation online while fewer guardians than it needs respond', async () => {
        // one partial result does not make the federation offline yet, but
        // 2 of 4 is under the 3 it needs
        renderScreen({ guardianStatuses: makeGuardianStatuses(2, 4) })

        await user.press(await screen.findByTestId('wallet-service-guardians'))

        expect(
            screen.getByText(
                'Your Federation needs 3 of 4 guardians online to make payments.',
            ),
        ).toBeOnTheScreen()
        expect(screen.queryByText(/is online/)).not.toBeOnTheScreen()
    })

    it('should put the offline warning in the sheet header once the federation is offline', async () => {
        const statuses = makeGuardianStatuses(4, 7)
        const { store } = renderScreen({ guardianStatuses: statuses })
        await screen.findByText(guardiansCount(4, 7))
        const lastCheck = await sustain(store, statuses, 210)

        const now = jest.spyOn(Date, 'now').mockReturnValue(lastCheck)
        try {
            await user.press(screen.getByTestId('wallet-service-guardians'))
        } finally {
            now.mockRestore()
        }

        expect(screen.getAllByText(offlineMessage(7))).toHaveLength(2)
        expect(dotColor('wallet-service-guardians-status-dot')).toBe(
            theme.colors.red,
        )
    })

    it('should check the guardians again when the list is opened', async () => {
        renderScreen({
            guardianStatuses: makeGuardianStatuses(0, 1),
            refreshedGuardianStatuses: makeGuardianStatuses(1, 1),
        })
        const trigger = await screen.findByTestId('wallet-service-guardians')

        const now = jest.spyOn(Date, 'now')
        now.mockReturnValue(Date.now() + 31_000)
        try {
            await user.press(trigger)
        } finally {
            now.mockRestore()
        }

        await waitFor(() =>
            expect(dotColor('wallet-service-guardian-0-dot')).toBe(
                theme.colors.success,
            ),
        )
    })

    it('should not offer the guardian list before the statuses have loaded', async () => {
        renderScreen({ federationJoined: false })

        await waitFor(() => {
            expect(
                screen.queryByTestId('wallet-service-guardians'),
            ).not.toBeOnTheScreen()
        })
    })

    it('should not claim guardian liveness before the federation has joined', async () => {
        renderScreen({ federationJoined: false })

        await waitFor(() => {
            expect(screen.queryByText(/online/i)).not.toBeOnTheScreen()
        })
    })

    it('should offer a shortcut to rename the service', async () => {
        renderScreen()

        await user.press(screen.getByTestId('wallet-service-edit-name'))

        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceSettings',
        )
    })

    it('renders a skeleton in place of the guardian count while the FA is unsynced', async () => {
        renderScreen({ formed: { ...federation, freshness: 'unsynced' } })
        await waitFor(() => {})

        expect(
            screen.getByTestId('wallet-service-guardians-skeleton'),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.dashboard-guardian-count', {
                    total: 7,
                }),
            ),
        ).toBeNull()
    })

    it('hides the balance and disables Withdraw while the federation is not loaded', async () => {
        renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: false,
        })
        await waitFor(() => {})
        expect(screen.queryByTestId('wallet-service-balance-amount')).toBeNull()
        expect(
            screen.getByTestId('wallet-service-recovery-in-progress'),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('wallet-service-withdraw')).toBeDisabled()
    })

    // A `backupEligible` restored service lands here before its federation is
    // joined, so the join can still fail under a mounted dashboard. The
    // terminal state — what went wrong, and the way out of it — lives on
    // WalletServiceProgress, and the dashboard has only a spinner to offer.
    it('should hand a failed rejoin to the terminal progress screen', async () => {
        const { store } = renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: false,
        })
        await waitFor(() => {})
        expect(mockNavigation.replace).not.toHaveBeenCalled()

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })

        expect(mockNavigation.replace).toHaveBeenCalledWith(
            'WalletServiceProgress',
        )
    })

    // The bridge reports a failed `faFederationJoin` on the created path too,
    // where the flow status stays `formed` and this screen is where the user
    // belongs. Handing that one to WalletServiceProgress lands it on the
    // *creation* checklist — confetti, then Continue into fee onboarding —
    // because the terminal state there only renders for a restored service.
    it('should keep a created service on the dashboard when a join fails', async () => {
        const { store } = renderScreen({ federationJoined: false })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })

        expect(mockNavigation.replace).not.toHaveBeenCalled()
    })

    // After a relaunch the app has no record of the formation, but the bridge
    // reports a federation formed here as backup eligible from the start.
    it('should keep a service created in an earlier launch on the dashboard when its join fails', async () => {
        const { store } = renderScreen({
            status: { type: 'formed', federation },
            federationJoined: false,
        })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })

        expect(
            screen.getByTestId('wallet-service-join-failed'),
        ).toBeOnTheScreen()
        expect(mockNavigation.replace).not.toHaveBeenCalled()
    })

    it('should keep the spinner for a created service whose join has not failed', async () => {
        const { queryByTestId } = renderScreen({ federationJoined: false })
        await waitFor(() => {})

        expect(
            queryByTestId('wallet-service-recovery-in-progress'),
        ).not.toBeNull()
        expect(queryByTestId('wallet-service-join-failed')).toBeNull()
    })

    // The spinner says "working on it" about a join the bridge has already
    // given up on — nothing on this device retries it before the next launch.
    it('should replace the spinner with a failure card when a created join fails', async () => {
        const { store } = renderScreen({ federationJoined: false })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })

        expect(
            screen.getByTestId('wallet-service-join-failed'),
        ).toBeOnTheScreen()
        expect(
            screen.queryByTestId('wallet-service-recovery-in-progress'),
        ).toBeNull()
        expect(screen.getByTestId('wallet-service-withdraw')).toBeDisabled()
        expect(mockNavigation.replace).not.toHaveBeenCalled()
        // the card takes the balance slot only: the guardian line is still the
        // one the FA snapshot decides
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.dashboard-guardian-count', {
                    total: 7,
                }),
            ),
        ).toBeOnTheScreen()
    })

    // the failure goes stale the moment the federation it names is ready, so
    // the card has to give way on its own rather than wait for a remount
    it('should give the card up for the balance once the federation loads', async () => {
        const { store } = renderScreen({ federationJoined: false })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })
        expect(
            screen.getByTestId('wallet-service-join-failed'),
        ).toBeOnTheScreen()

        await act(async () => {
            store.dispatch(
                setFederations([
                    {
                        ...mockFederation1,
                        id: WALLET_SERVICE_FEDERATION_ID,
                        name: federation.federationName ?? '',
                        balance: 21_000_000 as MSats,
                        recovering: false,
                    },
                ]),
            )
        })

        await waitFor(() =>
            expect(
                screen.queryByTestId('wallet-service-join-failed'),
            ).toBeNull(),
        )
        expect(
            screen.getByTestId('wallet-service-balance-amount'),
        ).toBeOnTheScreen()
    })

    // the restored path is handed to WalletServiceProgress's terminal state,
    // which owns the frozen checklist this card has no counterpart for
    it('should not show the failure card for a restored service', async () => {
        const { store } = renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: false,
        })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })

        expect(screen.queryByTestId('wallet-service-join-failed')).toBeNull()
        expect(mockNavigation.replace).toHaveBeenCalledWith(
            'WalletServiceProgress',
        )
    })

    it('should open a tagged support conversation from the failure card', async () => {
        const { store } = renderScreen({ federationJoined: false })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })
        await user.press(screen.getByTestId('contact-support-button'))

        // an untagged open leaves support with an open-ended chat instead of
        // knowing which wallet service to look at
        await waitFor(() =>
            expect(mockLaunchZendesk).toHaveBeenCalledWith(false, {
                conversationTags: [
                    'wallet-service-recovery-failed',
                    `wallet-service-${WALLET_SERVICE_FEDERATION_ID}`,
                ],
            }),
        )
    })

    it('should stay on the dashboard while the rejoin has not failed', async () => {
        const { store } = renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: false,
        })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFaFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'recovering' },
                }),
            )
        })

        expect(mockNavigation.replace).not.toHaveBeenCalled()
    })

    it('hides the balance and disables Withdraw while the federation is recovering', async () => {
        renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: true,
            recovering: true,
        })
        await waitFor(() => {})
        expect(screen.getByTestId('wallet-service-withdraw')).toBeDisabled()
    })

    it('shows the balance and enables Withdraw once usable', async () => {
        renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: true,
            feeBalance: 5_000_000,
        })
        await waitFor(() =>
            expect(screen.getByTestId('wallet-service-withdraw')).toBeEnabled(),
        )
    })

    // the wallet is federation-owned: an FA snapshot that is merely
    // re-reconciling must not take the balance away
    it('shows the balance for a created service whose FA snapshot is unsynced', async () => {
        renderScreen({
            formed: { ...federation, freshness: 'unsynced' },
            federationJoined: true,
            feeBalance: 5_000_000,
        })
        await waitFor(() =>
            expect(screen.getByTestId('wallet-service-withdraw')).toBeEnabled(),
        )

        expect(
            screen.getByTestId('wallet-service-balance-amount'),
        ).toBeOnTheScreen()
        expect(
            screen.queryByTestId('wallet-service-recovery-in-progress'),
        ).toBeNull()
        // the FA caveat still shows, on the guardian line only
        expect(
            screen.getByTestId('wallet-service-guardians-skeleton'),
        ).toBeOnTheScreen()
    })

    it('shows the balance for a backup-eligible restored service that is still unsynced', async () => {
        renderScreen({
            status: restoredStatus('unsynced', true),
            federationJoined: true,
            feeBalance: 5_000_000,
        })
        await waitFor(() =>
            expect(screen.getByTestId('wallet-service-withdraw')).toBeEnabled(),
        )

        expect(
            screen.getByTestId('wallet-service-balance-amount'),
        ).toBeOnTheScreen()
        expect(
            screen.queryByTestId('wallet-service-recovery-in-progress'),
        ).toBeNull()
        expect(
            screen.getByTestId('wallet-service-guardians-skeleton'),
        ).toBeOnTheScreen()
    })

    // the tour spotlight is measured in window coordinates with scrolling
    // locked — a card that grows or shrinks when recovery finishes moves the
    // spotlight off its target
    // Both branches share one wrapper style object (`style.balanceContent`),
    // so pinning both assertions to the same literal is exactly "the two
    // states report the same minHeight" — a single render can only ever be
    // in one state, and two renders in one test corrupt the shared test
    // renderer registry this harness uses.
    const PINNED_BALANCE_CONTENT_MIN_HEIGHT = 49

    it('keeps the balance card at its pinned height while not usable', async () => {
        renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: false,
        })
        await waitFor(() => {})

        expect(
            StyleSheet.flatten(
                screen.getByTestId('wallet-service-balance-content').props
                    .style,
            ).minHeight,
        ).toBe(PINNED_BALANCE_CONTENT_MIN_HEIGHT)
    })

    it('keeps the balance card at its pinned height once usable', async () => {
        renderScreen({
            status: restoredStatus('fresh'),
            federationJoined: true,
            feeBalance: 5_000_000,
        })
        await waitFor(() =>
            expect(screen.getByTestId('wallet-service-withdraw')).toBeEnabled(),
        )

        expect(
            StyleSheet.flatten(
                screen.getByTestId('wallet-service-balance-content').props
                    .style,
            ).minHeight,
        ).toBe(PINNED_BALANCE_CONTENT_MIN_HEIGHT)
    })

    it('should keep the balance hidden until it is tapped', async () => {
        renderScreen({ feeBalance: 5_000_000 })
        await waitFor(() => {})

        expect(screen.getByText('••••')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.dashboard-tap-to-reveal'),
            ),
        ).toBeOnTheScreen()
        expect(screen.queryByText(/sats/i)).not.toBeOnTheScreen()
    })

    it('should reveal the real balance when tapped', async () => {
        renderScreen({ feeBalance: 5_000_000 })

        await user.press(screen.getByTestId('wallet-service-balance'))

        expect(screen.getByText(/5,000 SATS/)).toBeOnTheScreen()
        expect(screen.queryByText('••••')).not.toBeOnTheScreen()
    })

    // The card used to read `federation.balance`, which is the operator's own
    // spendable ecash — a personal receive moved it, and claiming a fee was
    // the only thing that did not. The fixture federation holds 21,000 SATS
    // precisely so this can tell the two numbers apart.
    it('should reveal the claimable fees rather than the personal wallet balance', async () => {
        renderScreen({ feeBalance: 5_000_000 })

        await user.press(screen.getByTestId('wallet-service-balance'))

        expect(screen.queryByText(/21,000 SATS/)).not.toBeOnTheScreen()
    })

    // A service that has earned nothing has claimable fees of exactly zero.
    // That is a value, not an absent one, and it must not read as loading.
    it('should show a zero fee balance as zero', async () => {
        renderScreen({ feeBalance: 0 })

        await user.press(screen.getByTestId('wallet-service-balance'))

        expect(screen.getByText(/0 SATS/)).toBeOnTheScreen()
        expect(
            screen.queryByTestId('wallet-service-balance-skeleton'),
        ).toBeNull()
    })

    // The bridge answers this stream out of app state and the auto-join races
    // this screen's mount, so an early subscribe is refused — and nothing
    // reopens it once the federation lands.
    it('should not open the fee stream before the federation is loaded', async () => {
        renderScreen({ federationJoined: false })
        await waitFor(() => {})

        expect(mockFeeBalanceSubscribe).not.toHaveBeenCalled()
    })

    it('should open the fee stream for the wallet service federation once it loads', async () => {
        renderScreen()

        await waitFor(() =>
            expect(mockFeeBalanceSubscribe).toHaveBeenCalledWith(
                WALLET_SERVICE_FEDERATION_ID,
            ),
        )
        expect(mockFeeBalanceSubscribe).toHaveBeenCalledTimes(1)
    })

    it('should show a skeleton while the fee balance has not arrived', async () => {
        renderScreen({ feeBalance: 'pending' })

        // found, not got: the render where `isWalletReady` flips still carries
        // the hook's not-ready `isLoading: false`, so the amount shows for one
        // frame, and a slow runner asserted on that frame
        expect(
            await screen.findByTestId('wallet-service-balance-skeleton'),
        ).toBeOnTheScreen()
        expect(screen.queryByTestId('wallet-service-balance-amount')).toBeNull()
    })

    // Nothing reopens a refused stream, so a screen that kept spinning here
    // would spin until the user left it. Withdraw stays reachable: the fees
    // screen is where an error belongs, and this is the only way to it.
    it('should report unavailable fees rather than spin when the stream is refused', async () => {
        renderScreen({ feeBalance: 'error' })
        await waitFor(() =>
            expect(screen.getByTestId('wallet-service-withdraw')).toBeEnabled(),
        )

        expect(
            screen.queryByTestId('wallet-service-balance-skeleton'),
        ).toBeNull()
        expect(screen.getByText('—')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.dashboard-fees-unavailable'),
            ),
        ).toBeOnTheScreen()
    })

    it('should hide the balance again when tapped a second time', async () => {
        renderScreen({ feeBalance: 5_000_000 })

        await user.press(screen.getByTestId('wallet-service-balance'))
        await user.press(screen.getByTestId('wallet-service-balance'))

        expect(screen.getByText('••••')).toBeOnTheScreen()
    })

    it('should open the invite sheet from the qr button', async () => {
        renderScreen()

        await user.press(screen.getByTestId('wallet-service-invite'))

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.invite-to', {
                    name: 'Test Wallet Service',
                }),
            ),
        ).toBeOnTheScreen()
    })

    it('should go to the guardian fees dashboard from the withdraw button', async () => {
        renderScreen()

        // the id is parsed from the invite code, so the button only becomes
        // pressable once that resolves
        await waitFor(() =>
            expect(screen.getByTestId('wallet-service-withdraw')).toBeEnabled(),
        )
        await user.press(screen.getByTestId('wallet-service-withdraw'))

        expect(mockNavigation.navigate).toHaveBeenCalledWith('GuardianFees', {
            federationId: WALLET_SERVICE_FEDERATION_ID,
        })
    })

    it('should go back to the wallet tab from the header back button', async () => {
        renderScreen()

        await user.press(screen.getByTestId('HeaderBackButton'))

        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            reset('TabsNavigator', { initialRouteName: 'Wallet' }),
        )
    })

    it('should go back to the wallet tab from the hardware back button', async () => {
        renderScreen()

        await act(async () => {
            mockHardwareBack.press()
        })

        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            reset('TabsNavigator', { initialRouteName: 'Wallet' }),
        )
    })

    it('should claim the hardware back press so the stack is not popped too', async () => {
        renderScreen()

        let wasHandled = false
        await act(async () => {
            wasHandled = mockHardwareBack.press()
        })

        expect(wasHandled).toBe(true)
    })

    // one line, not the checklist: that shifted the page when the attach
    // completed, under the tour's spotlight
    it('should report a running lightning attach as a single line', async () => {
        renderScreen({ liquidity: runningAttach() })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.dashboard-lightning-attaching'),
            ),
        ).toBeOnTheScreen()
    })

    it('should open the provider sheet when the attach status is pressed', async () => {
        renderScreen({ liquidity: runningAttach() })

        await user.press(
            await screen.findByTestId('wallet-service-lightning-status'),
        )

        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceSettings',
            { openSheet: 'provider' },
        )
    })

    it('should not put the attach checklist on the dashboard', async () => {
        renderScreen({ liquidity: runningAttach() })

        await screen.findByText(
            i18n.t('feature.wallet-service.dashboard-lightning-attaching'),
        )
        expect(
            screen.queryByTestId('lightning-stage-requested'),
        ).not.toBeOnTheScreen()
    })

    it('should show no attach status when none is running', async () => {
        renderScreen()

        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.dashboard-lightning-attaching'),
            ),
        ).not.toBeOnTheScreen()
    })

    // a finished attach is not progress to report
    it('should show no attach status once the gateway view verifies', async () => {
        renderScreen({
            liquidity: runningAttach({ gatewayViewVerified: true }),
        })

        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.dashboard-lightning-attaching'),
            ),
        ).not.toBeOnTheScreen()
    })

    describe('the introduction tour', () => {
        it('should open on a first visit', async () => {
            renderScreen({ hasSeenTour: false })

            await waitFor(
                () => expect(lastTourProps().show).toBe(true),
                // the screen holds the tour back so its entrance can settle
                { timeout: 2000 },
            )
        })

        it('should stay closed once it has been seen', async () => {
            renderScreen({ hasSeenTour: true })

            // long enough to cover the delay the first visit waits out
            await new Promise(resolve => setTimeout(resolve, 900))

            expect(lastTourProps().show).toBe(false)
        })

        it('should not be seen again after it finishes', async () => {
            const { store } = renderScreen({ hasSeenTour: false })
            await waitFor(() => expect(lastTourProps().show).toBe(true), {
                timeout: 2000,
            })

            await act(async () => lastTourProps().onDone())

            expect(store.getState().nux.steps.hasSeenWalletServiceTour).toBe(
                true,
            )
            expect(lastTourProps().show).toBe(false)
        })

        it('should be seen once the last step is reached, before it closes', async () => {
            const { store } = renderScreen({ hasSeenTour: false })
            await waitFor(() => expect(lastTourProps().show).toBe(true), {
                timeout: 2000,
            })

            await act(async () => lastTourProps().onLastStep())

            // persisted while the sheet is still up, so a close that never
            // reports back cannot bring the tour round again
            expect(store.getState().nux.steps.hasSeenWalletServiceTour).toBe(
                true,
            )
            expect(lastTourProps().show).toBe(true)
        })

        it('should lock the page while it is open, and release it after', async () => {
            renderScreen({ hasSeenTour: false })
            const scrollArea = screen.UNSAFE_getByType(ScrollView)

            await waitFor(() => expect(lastTourProps().show).toBe(true), {
                timeout: 2000,
            })
            // a scroll under the scrim would leave every highlight, which is
            // measured in window coordinates, pointing at empty space
            expect(scrollArea.props.scrollEnabled).toBe(false)

            await act(async () => lastTourProps().onDone())

            expect(scrollArea.props.scrollEnabled).toBe(true)
        })
    })
})
