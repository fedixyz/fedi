import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import { setFiLiquidityOperation, setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type {
    RpcFiLiquidityDiscoveryResult,
    RpcFiLiquidityOperation,
    RpcFiLiquidityProvider,
} from '@fedi/common/types/bindings'

import { ProviderCard } from '../../../components/ui/ProviderCard'
import i18n from '../../../localization/i18n'
import WalletServiceLightningProvider from '../../../screens/WalletServiceLightningProvider'
import {
    mockNavigation,
    mockRoute,
    mockScreenFocus,
    mockToast,
} from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const FEDERATION_ID = 'wallet-service-federation'

/**
 * Signet, deliberately. A hard-coded `bitcoin` is what discarded the live
 * staging provider, so the fixtures advertise the network the federation
 * actually runs on and the filter has to agree with it.
 */
const provider: RpcFiLiquidityProvider = {
    providerPubkey: 'pubkey-1',
    supportedSources: ['gateway'],
    supportedNetworks: ['signet'],
    displayName: 'Manifold Liquidity',
    website: null,
    contact: null,
    issuedAt: 0,
    expiresAt: 0,
}

const oneProviderFound: RpcFiLiquidityDiscoveryResult = {
    type: 'discovery',
    providers: [provider],
    rejected: [],
}

const operation = (
    overrides: Partial<RpcFiLiquidityOperation> = {},
): RpcFiLiquidityOperation => ({
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
})

/**
 * The formed, fresh formation the bridge requires before it accepts a request.
 *
 * `liquidity` states what the app-wide monitor has already found. The screen is
 * a reader — `WalletServiceMonitor` owns the durable read and the poll — so a
 * test declares the finding rather than mocking RPCs the screen never makes.
 * The default is "read, nothing attached".
 */
const formedStore = (
    liquidity: {
        operation: RpcFiLiquidityOperation | null
        hasRead: boolean
        errorCode: null
        isRequesting?: boolean
    } = { operation: null, hasRead: true, errorCode: null },
) =>
    setupStore({
        federation: {
            federations: [
                { ...mockFederation1, id: FEDERATION_ID, network: 'signet' },
            ],
            // `selectLoadedFederations` indexes this map per federation, so an
            // absent one throws rather than reading as "not recovering"
            simulateRecoveryByFederation: {},
        },
        fi: {
            status: {
                type: 'formation',
                formation: {
                    formationId: 'formation-1',
                    phase: 'formed',
                    intent: {
                        federationName: 'My Wallet Service',
                        federationSize: 7,
                        guardianFeePpm: 5000,
                        plan: 'infiniteBestEffort',
                        fedimintdVersion: '0.11.1-fedi13',
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
                    inviteCode: 'fed11invite',
                    lastError: null,
                },
            },
            clientError: null,
            creationHighWaterMark: null,
            draft: { name: '', size: 7 },
            selectionPreview: null,
            eligiblePayers: null,
            operationError: null,
            liquidity: { isRequesting: false, ...liquidity },
        },
    } as any)

const renderScreen = (
    overrides: Record<string, unknown> = {},
    liquidity?: Parameters<typeof formedStore>[0],
) => {
    const store = formedStore(liquidity)
    const fedimint = createMockFedimintBridge({
        parseInviteCode: () => Promise.resolve({ federationId: FEDERATION_ID }),
        fiClientLiquidityList: () =>
            Promise.resolve({
                type: 'page',
                page: { operations: [], nextAfter: null },
            }),
        fiClientLiquidityCurrent: () =>
            Promise.resolve({ type: 'current', operation: null }),
        fiClientLiquidityDiscover: () => Promise.resolve(oneProviderFound),
        fiClientLiquidityStart: () =>
            Promise.resolve({ type: 'operation', operation: operation() }),
        fiClientLiquidityResume: () =>
            Promise.resolve({ type: 'operation', operation: operation() }),
        fiClientLiquidityStatus: () =>
            Promise.resolve({ type: 'operation', operation: operation() }),
        ...overrides,
    })

    return {
        fedimint,
        ...renderWithProviders(
            <WalletServiceLightningProvider
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            { fedimint, store },
        ),
        // last, so it survives the spread: it is the same object either way,
        // but the compiler cannot know that
        store,
    }
}

/**
 * Continue is inert until the durable read has answered — pressing before then
 * would act on a state the screen has not established. So every press waits for
 * that, exactly as a user does.
 */
const pressContinue = async (user: ReturnType<typeof userEvent.setup>) => {
    await settleDurableRead()
    return user.press(screen.getByTestId('lightning-continue'))
}

/**
 * Wait for the mount's durable read to answer.
 *
 * Until it does the card is inert and Continue is disabled, so a gesture would
 * either hang or be interrupted by the re-render that lands mid-press.
 */
const settleDurableRead = async () => {
    await waitFor(() =>
        expect(screen.getByTestId('lightning-continue')).toBeEnabled(),
    )
    await act(async () => {})
}

describe('screens/WalletServiceLightningProvider', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should preselect the provider without claiming one is verified', async () => {
        renderScreen()

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.lightning-managed'),
            ),
        ).toBeOnTheScreen()
        // RECOMMENDED is advice about which provider to pick, so it stands
        // here even though nothing is attached yet
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.recommended').toUpperCase(),
            ),
        ).toBeOnTheScreen()
        // the VERIFIED pill answers to an attached gateway, and nothing is
        // attached on this screen
        expect(
            screen.queryByText(
                i18n
                    .t('feature.wallet-service.lightning-verified')
                    .toUpperCase(),
            ),
        ).not.toBeOnTheScreen()
    })

    it('should offer bring your own as a link rather than an option', async () => {
        renderScreen()

        expect(screen.getByTestId('lightning-byo-link')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.lightning-byo-guide'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('words.advanced').toUpperCase()),
        ).toBeOnTheScreen()
        // nothing to pick: only the managed provider is a selectable card
        expect(screen.UNSAFE_getAllByType(ProviderCard)).toHaveLength(1)
    })

    it('should not fire any rpc when the provider is ticked or unticked', async () => {
        const { fedimint } = renderScreen()
        await settleDurableRead()

        await user.press(screen.getByTestId('lightning-managed-option'))
        await user.press(screen.getByTestId('lightning-managed-option'))

        expect(fedimint.fiClientLiquidityDiscover).not.toHaveBeenCalled()
        expect(fedimint.fiClientLiquidityStart).not.toHaveBeenCalled()
        expect(fedimint.fiClientLiquidityCurrent).not.toHaveBeenCalled()
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    it('should start exactly one liquidity request when continue is pressed ticked', async () => {
        const { fedimint } = renderScreen()

        await pressContinue(user)

        await waitFor(() =>
            expect(fedimint.fiClientLiquidityStart).toHaveBeenCalledTimes(1),
        )
        expect(fedimint.fiClientLiquidityStart).toHaveBeenCalledWith(
            'formation-1',
            'pubkey-1',
            {
                amounts: {
                    gatewayMinSats: 100_000,
                    gatewayMaxSats: 1_000_000,
                    stabilityMinSats: 0,
                    stabilityMaxSats: null,
                },
                approvedProviderPubkeys: [],
            },
        )
    })

    it('should discover against the federation network rather than a fixed bitcoin', async () => {
        const { fedimint } = renderScreen()

        await pressContinue(user)

        await waitFor(() =>
            expect(fedimint.fiClientLiquidityDiscover).toHaveBeenCalledWith(
                expect.anything(),
                'signet',
            ),
        )
    })

    // Continue means "attach this provider", so with nothing ticked it has
    // nothing to do; Skip is the exit
    it('should disable continue while the provider is unticked', async () => {
        const { fedimint } = renderScreen()
        await settleDurableRead()

        await user.press(screen.getByTestId('lightning-managed-option'))

        expect(screen.getByTestId('lightning-continue')).toBeDisabled()
        // the note says why the CTA has gone quiet
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.lightning-declined-note'),
            ),
        ).toBeOnTheScreen()

        // pressed directly, not through `pressContinue`: the point of this test
        // is the disabled CTA, and a helper that waits for it to be enabled
        // could only ever hang here
        await user.press(screen.getByTestId('lightning-continue'))

        expect(fedimint.fiClientLiquidityDiscover).not.toHaveBeenCalled()
        expect(fedimint.fiClientLiquidityStart).not.toHaveBeenCalled()
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    it('should re-enable continue when the provider is ticked again', async () => {
        renderScreen()
        await settleDurableRead()

        await user.press(screen.getByTestId('lightning-managed-option'))
        await user.press(screen.getByTestId('lightning-managed-option'))

        expect(screen.getByTestId('lightning-continue')).not.toBeDisabled()
    })

    it('should leave without requesting anything when skip is pressed', async () => {
        const { fedimint } = renderScreen()

        await user.press(screen.getByTestId('lightning-skip'))

        expect(fedimint.fiClientLiquidityStart).not.toHaveBeenCalled()
        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceDashboard',
        )
    })

    it('should not navigate until the gateway view is verified', async () => {
        // provider-authored progress, but the federation has not agreed — this
        // must not be presented as ready
        renderScreen()

        await pressContinue(user)

        await screen.findByTestId('lightning-stage-requested')
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    it('should navigate once the gateway view verifies', async () => {
        renderScreen({
            fiClientLiquidityStart: () =>
                Promise.resolve({
                    type: 'operation',
                    operation: operation({ gatewayViewVerified: true }),
                }),
        })

        await pressContinue(user)

        await waitFor(() =>
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceDashboard',
            ),
        )
    })

    // reaching `attached` by reading, rather than by watching a request through,
    // is a state to render — not a reason to move someone who has just arrived
    it('should not navigate for an attach found by the durable read', async () => {
        renderScreen(
            {},
            {
                operation: operation({ gatewayViewVerified: true }),
                hasRead: true,
                errorCode: null,
            },
        )

        await screen.findByText(
            i18n.t('feature.wallet-service.lightning-verified').toUpperCase(),
        )
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    // a lost response is recoverable, never permission to create a second
    // request: the contract is explicit that the same semantic operation is
    // resumed rather than replaced
    it('should adopt an existing operation instead of starting a second request', async () => {
        const { fedimint } = renderScreen(
            {},
            {
                operation: operation(),
                hasRead: true,
                errorCode: null,
            },
        )

        // the running request is already app-wide state, so there is no moment
        // at which a second one could be asked for
        await screen.findByTestId('lightning-stage-requested')
        await user.press(screen.getByTestId('lightning-continue'))

        expect(fedimint.fiClientLiquidityStart).not.toHaveBeenCalled()
        expect(fedimint.fiClientLiquidityDiscover).not.toHaveBeenCalled()
        // Continue now means "carry on" — the attach keeps running regardless
        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceDashboard',
        )
    })

    it('should read the canonical operation back when start reports an error', async () => {
        const current = jest
            .fn()
            // start's own resume check finds nothing
            .mockResolvedValueOnce({ type: 'current', operation: null })
            // the error followed a durable checkpoint, so the operation exists
            .mockResolvedValue({ type: 'current', operation: operation() })

        const { fedimint } = renderScreen({
            fiClientLiquidityCurrent: current,
            fiClientLiquidityStart: () =>
                Promise.resolve({
                    type: 'error',
                    error: { code: 'busy', message: 'lost', detail: null },
                }),
        })

        await pressContinue(user)

        // the recovered operation is adopted, so the screen reports a running
        // attach rather than a failure
        await screen.findByTestId('lightning-stage-requested')
        expect(fedimint.fiClientLiquidityStart).toHaveBeenCalledTimes(1)
    })

    it('should offer try again and skip on a retryable failure', async () => {
        renderScreen({
            fiClientLiquidityDiscover: () =>
                Promise.resolve({
                    type: 'error',
                    error: { code: 'busy', message: 'busy', detail: null },
                }),
        })

        await pressContinue(user)

        await waitFor(() =>
            expect(screen.getByTestId('lightning-banner')).toBeOnTheScreen(),
        )
        expect(screen.getByTestId('lightning-continue')).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.retry'))).toBeOnTheScreen()
        expect(screen.getByTestId('lightning-skip')).toBeOnTheScreen()
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    it('should leave skip as the only exit on a terminal failure', async () => {
        renderScreen({
            fiClientLiquidityDiscover: () =>
                Promise.resolve({
                    type: 'error',
                    error: {
                        code: 'capabilityUnavailable',
                        message: 'not available',
                        detail: null,
                    },
                }),
        })

        await pressContinue(user)

        await waitFor(() =>
            expect(screen.getByTestId('lightning-banner')).toBeOnTheScreen(),
        )
        expect(screen.queryByTestId('lightning-continue')).not.toBeOnTheScreen()
        expect(screen.getByTestId('lightning-skip')).toBeOnTheScreen()
    })

    // the operation is durable and the bridge keeps reconciling it, so running
    // out of watching time is not the request failing
    // there is no budget any more: the message is true the moment the request
    // is accepted, because the operation is watched app-wide from then on
    it('should say the attach carries on in the background as soon as it starts', async () => {
        renderScreen()

        await pressContinue(user)

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.lightning-still-setting-up'),
            ),
        ).toBeOnTheScreen()
        // being released is not a failed request
        expect(screen.queryByText(i18n.t('words.retry'))).not.toBeOnTheScreen()
    })

    it('should neither navigate nor toast when the user leaves mid-poll', async () => {
        // verification lands only after the user has gone, which is precisely
        // what the on-screen guard exists to ignore
        const { store } = renderScreen()

        await pressContinue(user)
        await screen.findByTestId('lightning-stage-requested')
        expect(mockNavigation.navigate).not.toHaveBeenCalled()

        act(() => mockScreenFocus.blur())
        await act(async () => {
            store.dispatch(
                setFiLiquidityOperation(
                    operation({ gatewayViewVerified: true }),
                ),
            )
        })

        expect(mockNavigation.navigate).not.toHaveBeenCalled()
        expect(mockToast.show).not.toHaveBeenCalled()
    })
})
