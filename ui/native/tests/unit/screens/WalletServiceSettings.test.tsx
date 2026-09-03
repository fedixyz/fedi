import {
    cleanup,
    fireEvent,
    screen,
    userEvent,
    waitFor,
    within,
} from '@testing-library/react-native'

import {
    recordFiLiquidityAbsent,
    setFiLiquidityOperation,
    setFiStatus,
    setupStore,
} from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type {
    RpcFiFormationSnapshot,
    RpcFiLiquidityOperation,
} from '@fedi/common/types/bindings'

import { ServiceSheet } from '../../../components/feature/walletservice/ServiceSheet'
import { ProviderCard } from '../../../components/ui/ProviderCard'
import i18n from '../../../localization/i18n'
import WalletServiceSettings from '../../../screens/WalletServiceSettings'
import {
    mockHardwareBack,
    mockNavigation,
    mockRoute,
    mockToast,
} from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

/**
 * The support hook is mocked rather than the Zendesk module beneath it: the
 * screen's contract is "the confirm opens support", and the hook is the seam
 * where that is decided. `useLaunchZendesk` also owns the not-yet-granted
 * branch that sends the user to the Help Centre, which is not this screen's
 * business to reimplement or to assert.
 */
const mockLaunchZendesk = jest.fn()
jest.mock('../../../utils/hooks/support', () => ({
    useLaunchZendesk: () => ({ launchZendesk: mockLaunchZendesk }),
}))

const makeFormation = (
    overrides: Partial<RpcFiFormationSnapshot> = {},
): RpcFiFormationSnapshot => ({
    formationId: 'formation-1',
    phase: 'formed',
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        // the resolved intent is creation-time and the app sends no fee at
        // creation, so the bridge reports 0 here whatever the applied rate.
        // The applied rate comes from federation consensus metadata.
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: false,
    milestones: {
        ecashSent: true,
        guardiansConfirmed: true,
        walletServiceCreated: true,
    },
    inviteCode: 'fed11invite',
    lastError: null,
    ...overrides,
})

/** The applied guardian fee as the federation publishes it: a ppm string. */
const GUARDIAN_FEE_META_KEY = 'fedi:guardian_fee_send_ppm'

/** What the invite code parses to — the wallet service's own federation. */
const WALLET_SERVICE_FEDERATION_ID = 'wallet-service-federation'

const makePreviewBridge = (
    meta: Record<string, string> = { [GUARDIAN_FEE_META_KEY]: '5000' },
    overrides: Record<string, unknown> = {},
) =>
    createMockFedimintBridge({
        fiClientUpdateFederationMetadata: { type: 'success' },
        fiClientSetGuardianFee: { type: 'success' },
        // no gateway attached unless a test says otherwise
        fiClientLiquidityList: () =>
            Promise.resolve({
                type: 'page',
                page: { operations: [], nextAfter: null },
            }),
        fiClientLiquidityCurrent: () =>
            Promise.resolve({ type: 'current', operation: null }),
        federationPreview: () =>
            Promise.resolve({
                id: 'fed-1',
                name: 'My Wallet Service',
                meta,
                inviteCode: 'fed11invite',
                returningMemberStatus: { type: 'newMember' },
            }),
        parseInviteCode: () =>
            Promise.resolve({
                federationId: WALLET_SERVICE_FEDERATION_ID,
                url: 'wss://guardian.example',
            }),
        ...overrides,
    })

const renderScreen = ({
    liquidity,
    fedimint = makePreviewBridge(),
    formation = makeFormation(),
}: {
    fedimint?: ReturnType<typeof createMockFedimintBridge>
    formation?: RpcFiFormationSnapshot
    /**
     * What the app-wide monitor has already found.
     *
     * The screen is a reader now: `WalletServiceMonitor` owns the durable read
     * and the poll, so a test states what was found rather than mocking the
     * RPCs a screen no longer makes. `undefined` means "read, nothing
     * attached", which is what most of these tests assume.
     */
    liquidity?: RpcFiLiquidityOperation | null | false
} = {}) => {
    const store = setupStore()
    store.dispatch(setFiStatus({ type: 'formation', formation }))
    // `hasRead: false` is the state before the monitor's durable read answers,
    // and is deliberately NOT the same as "nothing attached"
    if (liquidity === false) {
        // leave the slice untouched: the read has not answered
    } else if (liquidity) {
        store.dispatch(setFiLiquidityOperation(liquidity))
    } else {
        store.dispatch(recordFiLiquidityAbsent())
    }
    renderWithProviders(
        <WalletServiceSettings
            navigation={mockNavigation as never}
            route={mockRoute as never}
        />,
        { store, fedimint },
    )
    return fedimint
}

describe('screens/WalletServiceSettings', () => {
    // a fresh instance per test: a shared one stops driving the overlay once
    // the first test tears its tree down
    let user: ReturnType<typeof userEvent.setup>

    beforeEach(() => {
        user = userEvent.setup()
    })

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    const pressOverlayButton = (name: string) =>
        user.press(screen.getByRole('button', { name }))

    it('should show the service name, fee and every settings section', async () => {
        renderScreen()

        expect(screen.getByText('My Wallet Service')).toBeOnTheScreen()
        // the applied rate is fetched from federation metadata, so it lands
        // a tick after the first render
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.fee-per-transaction', {
                    rate: '0.5%',
                }),
            ),
        ).toBeOnTheScreen()
        for (const section of [
            'general',
            'manage',
            'features',
            'legal',
            'members',
        ] as const) {
            expect(
                screen.getByText(i18n.t(`words.${section}`).toUpperCase()),
            ).toBeOnTheScreen()
        }
    })

    it('should save a new name through the metadata rpc', async () => {
        const fedimint = renderScreen()

        await user.press(screen.getByTestId('settings-name-row'))
        await user.clear(screen.getByTestId('settings-edit-input'))
        await user.type(screen.getByTestId('settings-edit-input'), 'Renamed')
        await pressOverlayButton(i18n.t('words.save'))

        expect(fedimint.fiClientUpdateFederationMetadata).toHaveBeenCalledWith({
            type: 'name',
            value: 'Renamed',
        })
    })

    it('should save the description as the welcomeMessage variant', async () => {
        const fedimint = renderScreen()

        await user.press(screen.getByTestId('settings-description-row'))
        await user.type(screen.getByTestId('settings-edit-input'), 'Community')
        await pressOverlayButton(i18n.t('words.save'))

        // the bridge has no description variant; welcomeMessage is what Fedi
        // renders as the description
        expect(fedimint.fiClientUpdateFederationMetadata).toHaveBeenCalledWith({
            type: 'welcomeMessage',
            value: 'Community',
        })
    })

    it('should change the fee in a sheet rather than leaving the screen', async () => {
        const fedimint = renderScreen()

        await user.press(screen.getByTestId('settings-fee-row'))

        // the picker is the same one the onboarding step uses
        expect(screen.getByTestId('fee-option-custom')).toBeOnTheScreen()
        expect(mockNavigation.navigate).not.toHaveBeenCalled()

        await user.press(screen.getByTestId('fee-option-10000'))
        await pressOverlayButton(i18n.t('words.save'))

        expect(fedimint.fiClientSetGuardianFee).toHaveBeenCalledWith(10_000)
    })

    // the row used to read `intent.guardianFeePpm`, which is creation-time and
    // always 0, so a save that worked still left the row saying "Not set"
    it('should read the applied fee from federation metadata, not the intent', async () => {
        const fedimint = renderScreen()

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.fee-per-transaction', {
                    rate: '0.5%',
                }),
            ),
        ).toBeOnTheScreen()
        expect(fedimint.federationPreview).toHaveBeenCalledWith('fed11invite')
    })

    it('should say the fee is not set only when the federation publishes none', async () => {
        renderScreen({ fedimint: makePreviewBridge({}) })

        expect(
            await screen.findAllByText(
                i18n.t('feature.wallet-service.settings-not-set'),
            ),
        ).not.toHaveLength(0)
    })

    // guardians set the rate to 0 to stop new accrual, so a published zero is
    // a policy, not an absence. Testing it falsily would report it as unset.
    it('should show a published zero rate as a rate, not as unset', async () => {
        renderScreen({
            fedimint: makePreviewBridge({
                [GUARDIAN_FEE_META_KEY]: '0',
            }),
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.fee-per-transaction', {
                    rate: '0.0%',
                }),
            ),
        ).toBeOnTheScreen()
    })

    // an empty string parses to 0 through Number(), which would invent a
    // zero-fee policy out of a blank field
    it('should treat an empty published rate as unset, not as zero', async () => {
        renderScreen({
            fedimint: makePreviewBridge({ [GUARDIAN_FEE_META_KEY]: '' }),
        })

        expect(
            await screen.findAllByText(
                i18n.t('feature.wallet-service.settings-not-set'),
            ),
        ).not.toHaveLength(0)
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.fee-per-transaction', {
                    rate: '0.0%',
                }),
            ),
        ).toBeNull()
    })

    // consensus lags the save, so re-reading immediately would return the old
    // rate. The row must not drop back to "Not set" after a save that worked.
    it('should hold a just-saved fee on screen until consensus reports it', async () => {
        // metadata never catches up in this test: the fee stays absent
        renderScreen({ fedimint: makePreviewBridge({}) })

        await user.press(screen.getByTestId('settings-fee-row'))
        await user.press(screen.getByTestId('fee-option-10000'))
        await pressOverlayButton(i18n.t('words.save'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.fee-per-transaction', {
                    // formatFeePercent pads a whole number to one decimal
                    rate: '1.0%',
                }),
            ),
        ).toBeOnTheScreen()
    })

    // a metadata read that fails must not report the fee as unset
    it('should keep the last known fee when the metadata read fails', async () => {
        renderScreen({
            fedimint: makePreviewBridge(
                {},
                {
                    federationPreview: () =>
                        Promise.reject(new Error('bridge down')),
                },
            ),
        })

        await waitFor(() => {
            expect(screen.getByTestId('settings-fee-row')).toBeOnTheScreen()
        })
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should choose a lightning provider in a sheet rather than leaving the screen', async () => {
        renderScreen()

        await user.press(screen.getByTestId('settings-lightning-row'))

        expect(screen.getByTestId('lightning-managed-option')).toBeOnTheScreen()
        // bring-your-own is removed until a gateway can actually be attached
        expect(
            screen.queryByTestId('lightning-byo-option'),
        ).not.toBeOnTheScreen()
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    it('should install the ready-made terms of service', async () => {
        const fedimint = renderScreen()

        await user.press(screen.getByTestId('settings-terms-row'))
        await user.press(screen.getByTestId('terms-ready-made-row'))

        // the variant carries no value: it installs one fixed document
        expect(fedimint.fiClientUpdateFederationMetadata).toHaveBeenCalledWith({
            type: 'termsOfService',
        })
    })

    const requestStableBalance = async () => {
        await user.press(screen.getByTestId('settings-stable-balance-row'))
        await pressOverlayButton(
            i18n.t('feature.wallet-service.settings-stable-balance-request'),
        )
    }

    it('should hand the stable balance request to support', async () => {
        renderScreen()

        await requestStableBalance()

        // the launch is deferred until the sheet has closed, so this is the
        // one place the suite waits on a timer rather than on state
        await waitFor(() => expect(mockLaunchZendesk).toHaveBeenCalledTimes(1))
    })

    it('should not claim the stable balance was enabled', async () => {
        renderScreen()

        await requestStableBalance()
        await waitFor(() => expect(mockLaunchZendesk).toHaveBeenCalled())

        // there is no entitlement rpc, so nothing here may report success
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should open support only once the request is confirmed', async () => {
        renderScreen()

        await user.press(screen.getByTestId('settings-stable-balance-row'))
        await screen.findByRole('button', {
            name: i18n.t(
                'feature.wallet-service.settings-stable-balance-request',
            ),
        })

        // opening the sheet is not the request — a mis-tap must not drop
        // someone into a support conversation
        expect(mockLaunchZendesk).not.toHaveBeenCalled()
    })

    it('should not claim the lightning provider was saved', async () => {
        renderScreen()

        await user.press(screen.getByTestId('settings-lightning-row'))
        await pressOverlayButton(i18n.t('words.done'))

        // nothing is persisted, so nothing may report success
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    // "we have not found out yet" is not "nothing is attached". Saying the
    // latter before the read lands is what made an attached provider read as
    // absent on every fresh mount.
    it('should not claim the provider is unset before the read answers', async () => {
        renderScreen({ liquidity: false })

        expect(
            within(screen.getByTestId('settings-lightning-row')).getByText(
                i18n.t('feature.wallet-service.lightning-checking'),
            ),
        ).toBeOnTheScreen()
        expect(
            within(screen.getByTestId('settings-lightning-row')).queryByText(
                i18n.t('feature.wallet-service.settings-not-set'),
            ),
        ).toBeNull()
    })

    it('should not let the card be changed before the read answers', async () => {
        renderScreen({ liquidity: false })

        await user.press(screen.getByTestId('settings-lightning-row'))
        await screen.findByText(
            i18n.t('feature.wallet-service.lightning-sheet-help'),
        )

        // nothing may be requested against a state we have not established
        const card = screen.UNSAFE_getAllByType(ProviderCard)[0]
        expect(card?.props.onPress).toBeUndefined()
    })

    it('should report the gateway the bridge says is attached', async () => {
        renderScreen({
            liquidity: {
                formationId: 'formation-1',
                gatewayViewVerified: true,
            } as never,
        })

        // the row reflects what step 08 actually attached, not a local flag
        await waitFor(() =>
            expect(
                within(screen.getByTestId('settings-lightning-row')).getByText(
                    i18n.t('feature.wallet-service.lightning-managed'),
                ),
            ).toBeOnTheScreen(),
        )
    })

    it('should report no provider until the gateway view is verified', async () => {
        renderScreen({
            liquidity: {
                formationId: 'formation-1',
                gatewayViewVerified: false,
            } as never,
        })

        // the row settles on the running state first
        await screen.findByText(
            i18n.t('feature.wallet-service.lightning-attaching'),
        )

        // provider-authored evidence alone is not an attached gateway
        expect(
            within(screen.getByTestId('settings-lightning-row')).queryByText(
                i18n.t('feature.wallet-service.lightning-managed'),
            ),
        ).toBeNull()
    })

    // an operation that is still running is neither attached nor absent, and
    // it is the state a user lands in by opening settings straight after
    // creating the service
    it('should report the attach as running while the gateway view is unverified', async () => {
        renderScreen({
            liquidity: {
                formationId: 'formation-1',
                gatewayViewVerified: false,
            } as never,
        })

        await waitFor(() =>
            expect(
                within(screen.getByTestId('settings-lightning-row')).getByText(
                    i18n.t('feature.wallet-service.lightning-attaching'),
                ),
            ).toBeOnTheScreen(),
        )
    })

    it('should report no provider at all when nothing has been requested', async () => {
        renderScreen()

        await waitFor(() =>
            expect(
                within(screen.getByTestId('settings-lightning-row')).getByText(
                    i18n.t('feature.wallet-service.lightning-none'),
                ),
            ).toBeOnTheScreen(),
        )
    })

    /**
     * The sheet used to say the verified provider "stays active" over a ticked,
     * green-badged card, with no provider attached at all. Copy alone was not
     * enough: the tick and the pill assert the same thing in two more shapes.
     */
    it('should not assert a provider in the sheet when none is attached', async () => {
        renderScreen()

        await user.press(screen.getByTestId('settings-lightning-row'))

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.lightning-not-attached-note'),
            ),
        ).toBeOnTheScreen()
        // the VERIFIED pill answers to an attached gateway and nothing else
        expect(
            screen.queryByText(
                i18n
                    .t('feature.wallet-service.lightning-verified')
                    .toUpperCase(),
            ),
        ).toBeNull()
    })

    // the attach is one-way: an attached provider cannot be removed here, which
    // is the whole basis of `lightning-manage-note`
    it('should fix the card once a gateway is attached, so it cannot be unticked', async () => {
        renderScreen({
            liquidity: {
                formationId: 'formation-1',
                gatewayViewVerified: true,
            } as never,
        })

        await user.press(screen.getByTestId('settings-lightning-row'))
        await screen.findByText(
            i18n.t('feature.wallet-service.lightning-manage-note'),
        )

        const card = screen.UNSAFE_getAllByType(ProviderCard)[0]
        expect(card?.props.isSelected).toBe(true)
        // no handler is what fixes it; `isStatic` then drops the tick that
        // would otherwise invite a press
        expect(card?.props.onPress).toBeUndefined()
        expect(card?.props.isStatic).toBe(true)
    })

    /**
     * The attach is watched app-wide, so closing costs nothing and the sheet is
     * informational while it runs. Holding someone in front of something they
     * cannot act on is the trap `CustomOverlay`'s own source warns about.
     *
     * Asserted through the two real exits — the Done button and the Android
     * hardware back button. The sheet's own `onDismiss` prop is not the app's
     * handler in this render tree, so a test driving it proves nothing.
     */
    it('should keep Done pressable while a request is running', async () => {
        renderScreen({
            liquidity: {
                formationId: 'formation-1',
                gatewayViewVerified: false,
            } as never,
        })

        await user.press(screen.getByTestId('settings-lightning-row'))
        // the row reports the third state, not "Not set" and not a provider
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.lightning-attaching'),
            ),
        ).toBeOnTheScreen()

        const sheet = screen
            .UNSAFE_getAllByType(ServiceSheet)
            .find(
                node =>
                    node.props.title ===
                    i18n.t('feature.wallet-service.settings-lightning'),
            )
        const done = sheet?.props.buttons.find(
            (button: { text: string }) => button.text === i18n.t('words.done'),
        )
        expect(done?.disabled).toBeFalsy()
    })

    // the header chevron and hardware back are separate paths out, so a lock on
    // one leaks through the other. Neither should exist any more.
    it('should not claim the hardware back button while a request is running', async () => {
        renderScreen({
            liquidity: {
                formationId: 'formation-1',
                gatewayViewVerified: false,
            } as never,
        })

        await user.press(screen.getByTestId('settings-lightning-row'))
        await screen.findByText(
            i18n.t('feature.wallet-service.lightning-sheet-help'),
        )

        // nothing swallows the press, so the user leaves as they normally would
        expect(mockHardwareBack.press()).toBe(false)
    })

    it('should keep the verified card and note once a gateway is attached', async () => {
        renderScreen({
            liquidity: {
                formationId: 'formation-1',
                gatewayViewVerified: true,
            } as never,
        })

        await user.press(screen.getByTestId('settings-lightning-row'))

        expect(
            await screen.findByText(
                i18n
                    .t('feature.wallet-service.lightning-verified')
                    .toUpperCase(),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.lightning-manage-note'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.UNSAFE_getAllByType(ProviderCard)[0]?.props.isSelected,
        ).toBe(true)
    })

    it('should not offer to link a custom terms url it cannot install', async () => {
        const fedimint = renderScreen()

        await user.press(screen.getByTestId('settings-terms-row'))
        await user.press(screen.getByTestId('terms-link-own-row'))

        // the row says why rather than accepting a tap and refusing it
        expect(
            screen.getByText(
                i18n.t(
                    'feature.wallet-service.settings-terms-link-own-unavailable',
                ),
            ),
        ).toBeOnTheScreen()
        expect(mockToast.show).not.toHaveBeenCalled()
        expect(fedimint.fiClientUpdateFederationMetadata).not.toHaveBeenCalled()
    })

    it('should save an icon url through the metadata rpc', async () => {
        const fedimint = renderScreen()

        await user.press(screen.getByTestId('settings-icon-row'))
        await user.type(
            screen.getByTestId('settings-edit-input'),
            'https://example.com/icon.png',
        )
        await pressOverlayButton(i18n.t('words.save'))

        expect(fedimint.fiClientUpdateFederationMetadata).toHaveBeenCalledWith({
            type: 'iconUrl',
            value: 'https://example.com/icon.png',
        })
        expect(fedimint.fiClientUpdateFederationMetadata).toHaveBeenCalledTimes(
            1,
        )
    })

    it.each([
        ['a scheme the federation cannot fetch', 'ftp://example.com/icon.png'],
        ['text that is not a url at all', 'my-logo.png'],
    ])('should reject %s without calling the rpc', async (_label, entered) => {
        const fedimint = renderScreen()

        await user.press(screen.getByTestId('settings-icon-row'))
        await user.type(screen.getByTestId('settings-edit-input'), entered)

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.settings-icon-invalid'),
            ),
        ).toBeOnTheScreen()

        await pressOverlayButton(i18n.t('words.save'))
        expect(fedimint.fiClientUpdateFederationMetadata).not.toHaveBeenCalled()
    })

    it.each([
        ['a loopback name', 'http://localhost:3000/icon.png'],
        ['a loopback address', 'http://127.0.0.1/icon.png'],
        ['a private network address', 'http://192.168.1.4/icon.png'],
        ['a name members cannot resolve', 'https://intranet/icon.png'],
    ])(
        'should reject %s as a non-public host without calling the rpc',
        async (_label, entered) => {
            const fedimint = renderScreen()

            await user.press(screen.getByTestId('settings-icon-row'))
            await user.type(screen.getByTestId('settings-edit-input'), entered)

            // Manifold rejects these too, but a round trip is a poor way to
            // find out — the reason is named before the save
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.settings-icon-not-public'),
                ),
            ).toBeOnTheScreen()

            await pressOverlayButton(i18n.t('words.save'))
            expect(
                fedimint.fiClientUpdateFederationMetadata,
            ).not.toHaveBeenCalled()
        },
    )

    it('should read the icon, description and terms back from federation metadata', async () => {
        renderScreen({
            fedimint: makePreviewBridge({
                [GUARDIAN_FEE_META_KEY]: '5000',
                'fedi:federation_icon_url': 'https://example.com/icon.png',
                'fedi:welcome_message': 'Welcome to the shop',
                'fedi:tos_url': 'https://example.com/terms.pdf',
            }),
        })

        // none of these are on the formation intent — they only exist in the
        // federation's consensus metadata
        await waitFor(() => {
            expect(
                screen.getByText('https://example.com/icon.png'),
            ).toBeOnTheScreen()
        })
        expect(screen.getByText('Welcome to the shop')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.settings-terms-installed'),
            ),
        ).toBeOnTheScreen()
    })

    it('should say the icon and terms are unset when the federation publishes none', async () => {
        renderScreen()

        await waitFor(() => {
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.settings-terms-not-set'),
                ),
            ).toBeOnTheScreen()
        })
        // an unset icon opens an empty editor rather than pre-filling one —
        // asserted on the editor because several rows share the "Not set" label
        await user.press(screen.getByTestId('settings-icon-row'))
        expect(screen.getByTestId('settings-edit-input')).toHaveDisplayValue('')
    })

    it('should draw the published icon as the row thumbnail', async () => {
        renderScreen({
            fedimint: makePreviewBridge({
                [GUARDIAN_FEE_META_KEY]: '5000',
                'fedi:federation_icon_url': 'https://example.com/icon.png',
            }),
        })

        const thumbnail = await screen.findByTestId('settings-icon-thumbnail')
        expect(thumbnail.props.source).toEqual({
            uri: 'https://example.com/icon.png',
        })
    })

    it('should shorten a long icon url from the middle rather than wrapping', async () => {
        renderScreen({
            fedimint: makePreviewBridge({
                [GUARDIAN_FEE_META_KEY]: '5000',
                'fedi:federation_icon_url':
                    'https://upload.wikimedia.org/wikipedia/hif/8/82/Arsenal_FC.png',
            }),
        })

        const url = await screen.findByText(
            'https://upload.wikimedia.org/wikipedia/hif/8/82/Arsenal_FC.png',
        )
        // the host and the filename both identify the icon, so the path between
        // them is what gives way — and it stays on one line
        expect(url.props.numberOfLines).toBe(1)
        expect(url.props.ellipsizeMode).toBe('middle')
    })

    it('should let the wallet name wrap rather than shortening it', async () => {
        renderScreen()

        const name = await screen.findByText('My Wallet Service')
        expect(name.props.numberOfLines).toBeUndefined()
        expect(name.props.ellipsizeMode).toBeUndefined()
    })

    it('should fall back to the initial when the icon cannot be loaded', async () => {
        renderScreen({
            fedimint: makePreviewBridge({
                [GUARDIAN_FEE_META_KEY]: '5000',
                // a url is only validated for shape, never fetched, so one that
                // serves a web page rather than an image reaches this component
                'fedi:federation_icon_url': 'https://example.com/not-an-image',
            }),
        })

        const thumbnail = await screen.findByTestId('settings-icon-thumbnail')
        fireEvent(thumbnail, 'error')

        expect(screen.queryByTestId('settings-icon-thumbnail')).toBeNull()
        // "My Wallet Service" — the initial, not an empty square
        expect(screen.getByText('M')).toBeOnTheScreen()
    })

    it('should show the initial when the federation publishes no icon', async () => {
        renderScreen()

        await waitFor(() => {
            expect(screen.getByText('M')).toBeOnTheScreen()
        })
        expect(screen.queryByTestId('settings-icon-thumbnail')).toBeNull()
    })

    it('should pre-fill the editor with the icon url already published', async () => {
        renderScreen({
            fedimint: makePreviewBridge({
                [GUARDIAN_FEE_META_KEY]: '5000',
                'fedi:federation_icon_url': 'https://example.com/icon.png',
            }),
        })

        await waitFor(() => {
            expect(
                screen.getByText('https://example.com/icon.png'),
            ).toBeOnTheScreen()
        })
        await user.press(screen.getByTestId('settings-icon-row'))

        expect(screen.getByTestId('settings-edit-input')).toHaveDisplayValue(
            'https://example.com/icon.png',
        )
    })

    it('should hold a just-saved icon url until consensus reports it', async () => {
        // the federation still publishes the old icon: consensus lags the save
        const fedimint = renderScreen({
            fedimint: makePreviewBridge({
                [GUARDIAN_FEE_META_KEY]: '5000',
                'fedi:federation_icon_url': 'https://example.com/old.png',
            }),
        })

        await waitFor(() => {
            expect(
                screen.getByText('https://example.com/old.png'),
            ).toBeOnTheScreen()
        })

        await user.press(screen.getByTestId('settings-icon-row'))
        await user.clear(screen.getByTestId('settings-edit-input'))
        await user.type(
            screen.getByTestId('settings-edit-input'),
            'https://example.com/new.png',
        )
        await pressOverlayButton(i18n.t('words.save'))

        expect(fedimint.fiClientUpdateFederationMetadata).toHaveBeenCalledWith({
            type: 'iconUrl',
            value: 'https://example.com/new.png',
        })
        // the row must not flip back to the old icon after a save that worked
        expect(
            screen.getByText('https://example.com/new.png'),
        ).toBeOnTheScreen()
        expect(screen.queryByText('https://example.com/old.png')).toBeNull()
    })

    it('should report installed terms straight after installing them', async () => {
        renderScreen()

        await user.press(screen.getByTestId('settings-terms-row'))
        await user.press(screen.getByTestId('terms-ready-made-row'))

        // the url Manifold installs reaches consensus a moment later, so the
        // row must not still read "not set" after a save that worked
        await waitFor(() => {
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.settings-terms-installed'),
                ),
            ).toBeOnTheScreen()
        })
    })

    it('should keep the last known metadata when the read fails', async () => {
        renderScreen({
            fedimint: makePreviewBridge(
                { [GUARDIAN_FEE_META_KEY]: '5000' },
                { federationPreview: () => Promise.reject(new Error('down')) },
            ),
        })

        // a failed read must not report every field as unset
        await waitFor(() => {
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.settings-terms-not-set'),
                ),
            ).toBeOnTheScreen()
        })
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should open the invite sheet in place', async () => {
        renderScreen()

        await user.press(screen.getByTestId('settings-invite-row'))

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.invite-to', {
                    name: 'My Wallet Service',
                }),
            ),
        ).toBeOnTheScreen()
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    it('should go to the guardian fees dashboard from the withdraw row', async () => {
        renderScreen()

        // the id is parsed from the invite code, so wait for that before
        // pressing or the row has nothing to navigate with
        await waitFor(() =>
            expect(mockNavigation.navigate).not.toHaveBeenCalled(),
        )
        await user.press(screen.getByTestId('settings-withdraw-row'))

        await waitFor(() =>
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'GuardianFees',
                { federationId: WALLET_SERVICE_FEDERATION_ID },
            ),
        )
    })

    it('should not open the metadata editor until the wallet service is formed', async () => {
        const fedimint = renderScreen({
            formation: makeFormation({ phase: 'acquiringSeats' }),
        })

        await user.press(screen.getByTestId('settings-name-row'))

        expect(screen.queryByTestId('settings-edit-input')).toBeNull()
        expect(fedimint.fiClientUpdateFederationMetadata).not.toHaveBeenCalled()
    })
})
