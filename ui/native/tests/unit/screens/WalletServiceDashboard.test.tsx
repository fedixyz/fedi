import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import { ScrollView, StyleSheet } from 'react-native'

import {
    setFederations,
    setFiFederationJoin,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { MSats } from '@fedi/common/types'
import type {
    GuardianStatus,
    RpcFiFormationSnapshot,
    RpcFiLiquidityOperation,
    RpcFiStatus,
} from '@fedi/common/types/bindings'

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

const makeGuardianStatuses = (
    online: number,
    total: number,
): GuardianStatus[] => [
    ...Array.from({ length: online }, (_, i) => ({
        online: { guardian: `g${i}`, latency_ms: 50 },
    })),
    ...Array.from({ length: total - online }, (_, i) => ({
        timeout: { guardian: `g${online + i}`, elapsed: '5s' },
    })),
]

const formation: RpcFiFormationSnapshot = {
    formationId: 'formation-1',
    phase: 'formed',
    intent: {
        federationName: 'Test Wallet Service',
        federationSize: 7,
        guardianFeePpm: 1_000,
        plan: 'infiniteBestEffort',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: true,
    milestones: {
        ecashSent: true,
        guardiansConfirmed: true,
        walletServiceCreated: true,
    },
    inviteCode: INVITE_CODE,
    lastError: null,
}

/** Matches the fixture in `common/tests/unit/hooks/fiRecoveryStage.test.ts`. */
const restoredStatus = (
    freshness: 'unsynced' | 'fresh',
    backupEligible = false,
): RpcFiStatus => ({
    type: 'restored',
    formation: {
        snapshotGeneration: 3,
        formationId: 'formation-1',
        federationInvite: INVITE_CODE,
        federationName: 'Restored Wallet Service',
        seats: [],
        phase: 'formed',
        freshness,
        backupEligible,
    },
})

const renderScreen = ({
    snapshot = formation,
    // the federation the invite resolves to is joined and loaded, matching
    // the bridge's auto-join once formation reaches `formed`
    federationJoined = true,
    // the joined federation is the wallet service, so it publishes the live
    // name; that equals the creation-time intent until a rename
    federationName = formation.intent.federationName,
    renamedTo = null as string | null,
    balanceMsats = 0,
    guardianStatuses = null as GuardianStatus[] | null,
    hasSeenTour = true,
    // what the app-wide monitor has found; the dashboard is where a user lands
    // after walking away from an attach, so it has to report one
    liquidity = null as RpcFiLiquidityOperation | null,
    status = { type: 'formation', formation: snapshot } as RpcFiStatus,
    recovering = false,
}: {
    snapshot?: RpcFiFormationSnapshot
    federationJoined?: boolean
    federationName?: string
    renamedTo?: string | null
    balanceMsats?: number
    guardianStatuses?: GuardianStatus[] | null
    hasSeenTour?: boolean
    liquidity?: RpcFiLiquidityOperation | null
    status?: RpcFiStatus
    recovering?: boolean
} = {}) => {
    const state = setupStore().getState()
    const fedimint = createMockFedimintBridge({
        parseInviteCode: async () => ({
            federationId: WALLET_SERVICE_FEDERATION_ID,
        }),
        getGuardianStatus: async () => guardianStatuses ?? [],
    })

    return renderWithProviders(
        <WalletServiceDashboard
            navigation={mockNavigation as any}
            route={mockRoute as any}
        />,
        {
            fedimint,
            preloadedState: {
                federation: {
                    ...state.federation,
                    federations: federationJoined
                        ? [
                              {
                                  ...mockFederation1,
                                  id: WALLET_SERVICE_FEDERATION_ID,
                                  name: federationName,
                                  meta: renamedTo
                                      ? { federation_name: renamedTo }
                                      : mockFederation1.meta,
                                  balance: balanceMsats as MSats,
                                  recovering,
                              },
                          ]
                        : [],
                },
                fi: {
                    status,
                    clientError: null,
                    federationJoin: null,
                    creationHighWaterMark: null,
                    draft: { name: '', size: 10 },
                    selectionPreview: null,
                    replacementPreview: null,
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
            },
        },
    )
}

const runningAttach = (
    overrides: Partial<RpcFiLiquidityOperation> = {},
): RpcFiLiquidityOperation =>
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
    }) as RpcFiLiquidityOperation

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

    it('should take the guardian total from the formation', async () => {
        renderScreen({
            snapshot: {
                ...formation,
                intent: { ...formation.intent, federationSize: 13 },
            },
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

    it('should show a live guardian count once the federation is joined and all guardians are online', async () => {
        renderScreen({ guardianStatuses: makeGuardianStatuses(7, 7) })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.dashboard-live-guardians', {
                    online: 7,
                    total: 7,
                }),
            ),
        ).toBeOnTheScreen()
    })

    it('should show an offline guardian count when some guardians are not reachable', async () => {
        renderScreen({ guardianStatuses: makeGuardianStatuses(5, 7) })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.dashboard-offline-guardians', {
                    online: 5,
                    total: 7,
                }),
            ),
        ).toBeOnTheScreen()
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

    it('renders a skeleton in place of the guardian count while the FI is unsynced', async () => {
        renderScreen({ snapshot: { ...formation, freshness: 'unsynced' } })
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
                setFiFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })

        expect(mockNavigation.replace).toHaveBeenCalledWith(
            'WalletServiceProgress',
        )
    })

    // The bridge reports a failed `fiFederationJoin` on the created path too,
    // where the flow status stays `formed` and this screen is where the user
    // belongs. Handing that one to WalletServiceProgress lands it on the
    // *creation* checklist — confetti, then Continue into fee onboarding —
    // because the terminal state there only renders for a restored service.
    it('should keep a created service on the dashboard when a join fails', async () => {
        const { store } = renderScreen({ federationJoined: false })
        await waitFor(() => {})

        await act(async () => {
            store.dispatch(
                setFiFederationJoin({
                    federationId: WALLET_SERVICE_FEDERATION_ID,
                    state: { type: 'failed', message: 'guardian unreachable' },
                }),
            )
        })

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
                setFiFederationJoin({
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
        // one the FI snapshot decides
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
                setFiFederationJoin({
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
                        name: formation.intent.federationName,
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
                setFiFederationJoin({
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
                setFiFederationJoin({
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
                setFiFederationJoin({
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
            balanceMsats: 21_000_000,
        })
        await waitFor(() =>
            expect(screen.getByTestId('wallet-service-withdraw')).toBeEnabled(),
        )
    })

    // the wallet is federation-owned: an FI snapshot that is merely
    // re-reconciling must not take the balance away
    it('shows the balance for a created service whose FI snapshot is unsynced', async () => {
        renderScreen({
            snapshot: { ...formation, freshness: 'unsynced' },
            federationJoined: true,
            balanceMsats: 21_000_000,
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
        // the FI caveat still shows, on the guardian line only
        expect(
            screen.getByTestId('wallet-service-guardians-skeleton'),
        ).toBeOnTheScreen()
    })

    it('shows the balance for a backup-eligible restored service that is still unsynced', async () => {
        renderScreen({
            status: restoredStatus('unsynced', true),
            federationJoined: true,
            balanceMsats: 21_000_000,
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
            balanceMsats: 21_000_000,
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
        renderScreen({ balanceMsats: 21_000_000 })
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
        renderScreen({ balanceMsats: 21_000_000 })

        await user.press(screen.getByTestId('wallet-service-balance'))

        expect(screen.getByText(/21,000 SATS/)).toBeOnTheScreen()
        expect(screen.queryByText('••••')).not.toBeOnTheScreen()
    })

    it('should hide the balance again when tapped a second time', async () => {
        renderScreen({ balanceMsats: 21_000_000 })

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

    it('should not open the invite sheet when there is no invite code', async () => {
        renderScreen({ snapshot: { ...formation, inviteCode: null } })

        await user.press(screen.getByTestId('wallet-service-invite'))

        expect(
            screen.queryByText(i18n.t('feature.wallet-service.invite-link')),
        ).not.toBeOnTheScreen()
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
