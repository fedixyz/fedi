import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import { ScrollView } from 'react-native'

import { setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { MSats } from '@fedi/common/types'
import type {
    GuardianStatus,
    RpcFiFormationSnapshot,
    RpcFiLiquidityOperation,
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

jest.mock(
    '../../../components/feature/walletservice/WalletServiceTour',
    () => ({
        WalletServiceTour: (props: { show: boolean; onDone: () => void }) => {
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

const renderScreen = ({
    snapshot = formation,
    // the federation the invite resolves to is joined and loaded, matching
    // the bridge's auto-join once formation reaches `formed`
    federationJoined = true,
    balanceMsats = 0,
    guardianStatuses = null as GuardianStatus[] | null,
    hasSeenTour = true,
    // what the app-wide monitor has found; the dashboard is where a user lands
    // after walking away from an attach, so it has to report one
    liquidity = null as RpcFiLiquidityOperation | null,
}: {
    snapshot?: RpcFiFormationSnapshot
    federationJoined?: boolean
    balanceMsats?: number
    guardianStatuses?: GuardianStatus[] | null
    hasSeenTour?: boolean
    liquidity?: RpcFiLiquidityOperation | null
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
                                  balance: balanceMsats as MSats,
                              },
                          ]
                        : [],
                },
                fi: {
                    status: { type: 'formation', formation: snapshot },
                    clientError: null,
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

    it('should flag a stale snapshot as last known', async () => {
        renderScreen({ snapshot: { ...formation, freshness: 'unsynced' } })
        await waitFor(() => {})

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.showing-last-known'),
            ),
        ).toBeOnTheScreen()
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

    // the attach carries on wherever the user goes, and this is where they
    // land — so it is reported here rather than left invisible until someone
    // opens settings
    it('should report a running lightning attach', async () => {
        renderScreen({ liquidity: runningAttach() })

        expect(
            await screen.findByTestId('lightning-stage-requested'),
        ).toBeOnTheScreen()
    })

    it('should show no attach progress when none is running', async () => {
        renderScreen()

        expect(
            screen.queryByTestId('lightning-stage-requested'),
        ).not.toBeOnTheScreen()
    })

    // a finished attach is not progress to report
    it('should show no attach progress once the gateway view verifies', async () => {
        renderScreen({
            liquidity: runningAttach({ gatewayViewVerified: true }),
        })

        expect(
            screen.queryByTestId('lightning-stage-requested'),
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
