import {
    act,
    cleanup,
    fireEvent,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import { Modal } from 'react-native'

import { setFederations, setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { MSats } from '@fedi/common/types'
import type {
    RpcFiEligiblePayer,
    RpcFiOperationError,
    RpcFiSelectionPreview,
} from '@fedi/common/types/bindings'

import i18n from '../../../localization/i18n'
import ConfirmWalletService from '../../../screens/ConfirmWalletService'
import { mockNavigation, mockToast } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

// the top-up sheet reaches the QR renderer, which pulls in native-only modules
// (view-shot, the node build of `qrcode`) that the shared setup does not stub
jest.mock('../../../components/ui/QRCode', () => 'QRCode')

const TOTAL_MSATS = '1500000'

const makePreview = (
    overrides: Partial<RpcFiSelectionPreview> = {},
): RpcFiSelectionPreview => ({
    previewId: 'preview-1',
    selected: 2,
    totalAdvertisedMsats: TOTAL_MSATS,
    seen: 12,
    eligible: 8,
    validUntil: 0,
    seats: [
        {
            fmanId: 'fman-1',
            fmanName: 'amber alder',
            advertisedPriceMsats: '750000',
            provenance: 'registry',
        },
        {
            fmanId: 'fman-2',
            fmanName: 'briny beech',
            advertisedPriceMsats: '750000',
            provenance: 'registry',
        },
    ],
    ...overrides,
})

// affordability comes from the live federation balance, not the payers
// snapshot, so each case seeds the balance on the federation itself
const makePreloadedState = (
    payers: RpcFiEligiblePayer[],
    balanceMsats = 2000000,
    // set when the payer lookup itself failed, which is a different cause from
    // an empty list and must not share its copy
    payerError: RpcFiOperationError | null = null,
) => {
    const state = setupStore().getState()
    return {
        environment: {
            ...state.environment,
            transactionDisplayType: 'sats' as const,
            // the bridge rejects every fiClient* RPC before this is true, and
            // this screen is only reachable once it is
            onboardingCompleted: true,
        },
        federation: {
            ...state.federation,
            federations: [
                { ...mockFederation1, balance: balanceMsats as MSats },
            ],
            payFromFederationId: mockFederation1.id,
        },
        fi: {
            ...state.fi,
            selectionPreview: makePreview(),
            eligiblePayers: payers,
            payerError,
        },
    }
}

// the snapshot balance is stale by design (frozen at quote time), so it stays
// zero in every case to prove it never drives the screen
const eligiblePayer: RpcFiEligiblePayer = {
    federationId: mockFederation1.id,
    balanceMsats: '0',
}

const RICH_BALANCE_MSATS = 2000000
const BROKE_BALANCE_MSATS = 500000

// the bridge refuses the spend without saying how short the wallet is, so the
// screen has only the code to work from
const paymentError = {
    type: 'error' as const,
    error: {
        code: 'payment' as const,
        message: 'An FI payment operation failed',
        detail: null,
    },
}

const reauthorizationError = {
    type: 'error' as const,
    error: {
        code: 'selectionReauthorizationRequired' as const,
        message: 'guardian replaced',
        detail: {
            type: 'selectionReauthorizationRequired' as const,
            reason: 'guardianReplaced' as const,
        },
    },
}

describe('screens/ConfirmWalletService', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should leave the fiat amount as the last line of the total', () => {
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
            },
        )

        // the design ends the total at the fiat line; the spend cap the bridge
        // enforces is not surfaced here
        expect(screen.getByTestId('total-setup-cost')).toBeOnTheScreen()
        expect(screen.queryByText(/never be charged more than/)).toBeNull()
    })

    it('should label the receiver and the pay button with the wallet service copy', () => {
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
            },
        )

        expect(
            screen.getByText(i18n.t('feature.send.send-to')),
        ).toBeOnTheScreen()
        expect(screen.getByText('2 guardians')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.pay-create-button'),
            ),
        ).toBeOnTheScreen()
    })

    it('should show the guardian set changed banner instead of leaving the screen', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: Promise.resolve(reauthorizationError),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
                fedimint,
            },
        )

        await user.press(screen.getByTestId('SendConfirmButton'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.set-changed-title'),
            ),
        ).toBeOnTheScreen()
        expect(mockNavigation.goBack).not.toHaveBeenCalled()
    })

    it('should show a persistent banner rather than a toast when the payment is refused', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: Promise.resolve(paymentError),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
                fedimint,
            },
        )

        await user.press(screen.getByTestId('SendConfirmButton'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.payment-failed-title'),
            ),
        ).toBeOnTheScreen()
        // the same balance fails the same way, so a toast promising a retry
        // would be a lie that scrolls away
        expect(mockToast.show).not.toHaveBeenCalled()
        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
    })

    it('should clear the failed-payment banner when the user pays again', async () => {
        // the retry never settles, so the banner's absence can only come from
        // the reset at the start of the attempt, not from a second verdict
        let attempts = 0
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: () => {
                attempts += 1
                return attempts === 1
                    ? Promise.resolve(paymentError)
                    : new Promise(() => {})
            },
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
                fedimint,
            },
        )

        await user.press(screen.getByTestId('SendConfirmButton'))
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.payment-failed-title'),
            ),
        ).toBeOnTheScreen()

        // a second attempt owns the banner: the previous verdict must not sit
        // above a payment that is now in flight
        await user.press(screen.getByTestId('SendConfirmButton'))

        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.payment-failed-title'),
            ),
        ).toBeNull()
    })

    it('should fetch a fresh quote and stay on the screen when the banner action is pressed', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: Promise.resolve(reauthorizationError),
            fiClientPreviewSelection: Promise.resolve({
                type: 'preview',
                preview: makePreview({ previewId: 'preview-2' }),
            }),
            fiClientEligiblePayers: Promise.resolve({
                type: 'payers',
                payers: [eligiblePayer],
            }),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
                fedimint,
            },
        )

        await user.press(screen.getByTestId('SendConfirmButton'))
        await screen.findByText(
            i18n.t('feature.wallet-service.set-changed-title'),
        )

        await user.press(screen.getByText(i18n.t('words.continue')))

        await waitFor(() => {
            expect(fedimint.fiClientPreviewSelection).toHaveBeenCalled()
        })
        expect(fedimint.fiClientEligiblePayers).toHaveBeenCalled()
        expect(mockNavigation.goBack).not.toHaveBeenCalled()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.set-changed-title'),
            ),
        ).toBeNull()
    })

    it('should leave the screen only when the fresh quote also fails', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: Promise.resolve(reauthorizationError),
            fiClientPreviewSelection: Promise.resolve({
                type: 'error',
                error: { code: 'selection', message: 'nope', detail: null },
            }),
            fiClientEligiblePayers: Promise.resolve({
                type: 'payers',
                payers: [eligiblePayer],
            }),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
                fedimint,
            },
        )

        await user.press(screen.getByTestId('SendConfirmButton'))
        await screen.findByText(
            i18n.t('feature.wallet-service.set-changed-title'),
        )

        await user.press(screen.getByText(i18n.t('words.continue')))

        await waitFor(() => {
            expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
        })
    })

    it('should reveal the top up call to action when the payer cannot cover the total', () => {
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    BROKE_BALANCE_MSATS,
                ),
            },
        )

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.insufficient-title'),
            ),
        ).toBeOnTheScreen()
        // the shortfall names the wallet, what it holds and what is needed
        expect(
            screen.getByText(/test-federation has 500 SATS/),
        ).toBeOnTheScreen()
        expect(screen.getByText(/you need 1,500 SATS/)).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.wallet-service.top-up-button')),
        ).toBeOnTheScreen()
        // one live button, not a dead one above it: nothing can be paid until
        // this wallet is funded, so topping it up is the only thing to offer
        expect(screen.getByTestId('top-up-button')).toBeEnabled()
        expect(screen.queryByTestId('SendConfirmButton')).toBeNull()
    })

    /**
     * A shortfall the top-up has not closed is still a shortfall, so the banner
     * stays put while the sheet is open. It once looked like the header was
     * contradicting a sheet reading "Funds moved"; the header was right and the
     * sheet was reopening on a stale success state, which is fixed in the
     * sheet's own reset.
     */
    it('should keep the not-enough-funds banner while the top up sheet is up', async () => {
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    BROKE_BALANCE_MSATS,
                ),
            },
        )

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.insufficient-title'),
            ),
        ).toBeOnTheScreen()

        await user.press(screen.getByTestId('top-up-button'))

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.insufficient-title'),
            ),
        ).toBeOnTheScreen()

        // and still there once the sheet closes without funding anything.
        // Every modal is closed rather than the last one: the join sheet
        // renders after the top-up sheet, so "the last modal" is not the one
        // this test is about
        await act(async () => {
            screen
                .UNSAFE_queryAllByType(Modal)
                .forEach(modal => fireEvent(modal, 'requestClose'))
        })
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.insufficient-title'),
            ),
        ).toBeOnTheScreen()
    })

    it('should offer pay and create once the payer can cover the total', () => {
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
            },
        )

        expect(screen.getByTestId('SendConfirmButton')).toBeEnabled()
        // nothing to top up, so the lever that would do it is not offered
        expect(screen.queryByTestId('top-up-button')).toBeNull()
    })

    // the gate that used to stop this user at the Create tab is gone, so the
    // payment screen has to carry the explanation — with the price still on it
    // The screen never renders the "no wallet can pay" verdict. It cannot know
    // it — only the sheet's own lookup can — and a screen that showed it would
    // be stuck with it for its whole life, with nothing left to press.
    it('should offer the join and state no verdict when no federation is trusted', async () => {
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            { preloadedState: makePreloadedState([]) },
        )

        expect(screen.getByTestId('total-setup-cost')).toBeOnTheScreen()
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.join-card-title'),
            ),
        ).toBeOnTheScreen()
        // the way out is the back chevron, not a dead end's escape hatch
        expect(screen.queryByTestId('return-home-button')).toBeNull()
        // no top up: there is no wallet to top up
        expect(
            screen.queryByText(i18n.t('feature.wallet-service.top-up-button')),
        ).toBeNull()
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    // a failed lookup is not the same as "you are in no trusted federation":
    // membership is unknown, and the user is not being told to go and join one
    it('should distinguish a failed payer lookup from having no trusted federation', () => {
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState([], 2000000, {
                    code: 'registry',
                    message: 'registry unreachable',
                    detail: null,
                }),
            },
        )

        expect(screen.getByTestId('total-setup-cost')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.payer-lookup-failed-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.no-trusted-federation-title'),
            ),
        ).toBeNull()
        // membership is unknown, so a join offer would be a guess. This is the
        // one no-payer state with no way forward, so it keeps the escape hatch
        // the others do not need.
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.join-card-title'),
            ),
        ).toBeNull()
        expect(screen.getByTestId('return-home-button')).toBeOnTheScreen()
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should open the top up sheet without paying for setup', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPayAndCreate: Promise.resolve({ type: 'success' }),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    BROKE_BALANCE_MSATS,
                ),
                fedimint,
            },
        )

        await user.press(
            screen.getByText(i18n.t('feature.wallet-service.top-up-button')),
        )

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-to-fixed'),
            ),
        ).toBeOnTheScreen()
        expect(fedimint.fiClientPayAndCreate).not.toHaveBeenCalled()
    })

    it('should show the quote countdown derived from the preview validUntil', () => {
        const nowSecs = 1_700_000_000
        jest.useFakeTimers().setSystemTime(nowSecs * 1000)

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: {
                    ...makePreloadedState([eligiblePayer], RICH_BALANCE_MSATS),
                    fi: {
                        ...setupStore().getState().fi,
                        selectionPreview: makePreview({
                            validUntil: nowSecs + 125,
                        }),
                        eligiblePayers: [eligiblePayer],
                    },
                },
            },
        )

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.quote-valid-for', {
                    remaining: '2:05',
                }),
            ),
        ).toBeOnTheScreen()

        jest.useRealTimers()
    })

    // the countdown is a deadline on an action. Where there is no action, it
    // was a clock counting down to nothing, sitting next to the reason the
    // user could not act on it anyway
    it.each([
        [
            'the payer cannot cover the total',
            () => makePreloadedState([eligiblePayer], BROKE_BALANCE_MSATS),
        ],
        ['no wallet can pay at all', () => makePreloadedState([])],
    ])('should hide the quote countdown when %s', (_case, buildState) => {
        const nowSecs = 1_700_000_000
        jest.useFakeTimers().setSystemTime(nowSecs * 1000)
        const base = buildState()

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: {
                    ...base,
                    fi: {
                        ...base.fi,
                        selectionPreview: makePreview({
                            validUntil: nowSecs + 125,
                        }),
                    },
                },
            },
        )

        // the price itself still renders — only the deadline goes
        expect(screen.getByTestId('total-setup-cost')).toBeOnTheScreen()
        expect(screen.queryByTestId('quote-countdown')).toBeNull()

        jest.useRealTimers()
    })

    it('should show the expired-quote retry lever and disable pay when a transient refresh fails', async () => {
        const nowSecs = 1_700_000_000
        jest.useFakeTimers().setSystemTime(nowSecs * 1000)

        const fedimint = createMockFedimintBridge({
            fiClientPreviewSelection: Promise.resolve({
                type: 'error',
                error: {
                    code: 'fleetManager',
                    message: 'guardian host unreachable',
                    detail: null,
                },
            }),
            fiClientEligiblePayers: Promise.resolve({
                type: 'payers',
                payers: [eligiblePayer],
            }),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: {
                    ...makePreloadedState([eligiblePayer], RICH_BALANCE_MSATS),
                    fi: {
                        ...setupStore().getState().fi,
                        // already expired at the mocked "now"
                        selectionPreview: makePreview({
                            validUntil: nowSecs - 1,
                        }),
                        eligiblePayers: [eligiblePayer],
                    },
                },
                fedimint,
            },
        )

        expect(await screen.findByTestId('quote-expired')).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.wallet-service.quote-expired')),
        ).toBeOnTheScreen()
        const refreshButton = screen.getByTestId('refresh-quote-button')
        expect(refreshButton).toBeOnTheScreen()
        // an expired quote is not payable, so the footer offers the fresh
        // quote rather than a dead pay button above the live lever
        expect(screen.queryByTestId('SendConfirmButton')).toBeNull()

        await waitFor(() => {
            expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(1)
        })

        await user.press(refreshButton)

        await waitFor(() => {
            expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(2)
        })

        jest.useRealTimers()
    })

    // an already-expired validUntil fires the screen's own auto-refresh
    // effect on mount, without needing a pay attempt first
    const makeExpiredPreloadedState = () => ({
        ...makePreloadedState([eligiblePayer], RICH_BALANCE_MSATS),
        fi: {
            ...setupStore().getState().fi,
            selectionPreview: makePreview({ validUntil: 1 }),
            eligiblePayers: [eligiblePayer],
        },
    })

    it('should show the refreshing label and disable pay while a fresh quote is in flight', async () => {
        let resolvePreview: (value: {
            type: 'preview'
            preview: RpcFiSelectionPreview
        }) => void = () => {}
        const fedimint = createMockFedimintBridge({
            fiClientPreviewSelection: () =>
                new Promise(resolve => {
                    resolvePreview = resolve
                }),
            fiClientEligiblePayers: Promise.resolve({
                type: 'payers',
                payers: [eligiblePayer],
            }),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makeExpiredPreloadedState(),
                fedimint,
            },
        )

        expect(await screen.findByTestId('quote-refreshing')).toBeOnTheScreen()
        // the price on screen is about to be replaced, so there is nothing to
        // pay yet — the footer carries the refresh that is already running
        expect(screen.queryByTestId('SendConfirmButton')).toBeNull()
        expect(screen.getByTestId('refresh-quote-button')).toBeOnTheScreen()

        // let the pending preview settle so no promise is left hanging
        resolvePreview({ type: 'preview', preview: makePreview() })
        await waitFor(() => {
            expect(screen.queryByTestId('quote-refreshing')).toBeNull()
        })
    })

    // `fiClientPreviewSelection` enumerates every advertisement, verifies each
    // badge and dials candidates — 30-60s on a healthy fleet, longer on a
    // degraded one. The bridge stamps `validUntil` at the *start* of that work
    // (FMAN_SELECTION_PREVIEW_VALIDITY = 120s), so a slow selection returns a
    // quote that is already expired. The auto-refresh keys off `validUntil`,
    // and a fresh-but-expired quote has a *new* one — so it refreshes again,
    // immediately, forever. That is the 258 previews seen in one staging
    // session, and the guardian-set flicker that came with them.
    it('should not refresh in a loop when every fresh quote arrives expired', async () => {
        // capped so a runaway loop reports its count instead of hanging the
        // test: past the cap the mock hands back a quote that is still valid
        const RUNAWAY_CAP = 12
        const NOW_SECS = Math.floor(Date.now() / 1000)
        let issued = 0
        const fedimint = createMockFedimintBridge({
            // each call returns a distinct, already-expired validUntil, the
            // way a selection slower than the validity window would
            fiClientPreviewSelection: () => {
                issued += 1
                return Promise.resolve({
                    type: 'preview',
                    preview: makePreview({
                        validUntil:
                            issued >= RUNAWAY_CAP
                                ? NOW_SECS + 120
                                : 1000 + issued,
                    }),
                })
            },
            fiClientEligiblePayers: Promise.resolve({
                type: 'payers',
                payers: [eligiblePayer],
            }),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            { preloadedState: makeExpiredPreloadedState(), fedimint },
        )

        // give the effect every chance to re-fire on each new validUntil
        for (let tick = 0; tick < 5; tick += 1) {
            await act(async () => {
                jest.advanceTimersByTime(1000)
            })
        }

        // one attempt per mount, then it stops and lets the user retry. The
        // manual refresh control stays available either way.
        expect(
            fedimint.fiClientPreviewSelection.mock.calls.length,
        ).toBeLessThanOrEqual(2)
    })

    it('should show the lost-guardians banner and swap the footer when a refresh loses eligible seats', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientPreviewSelection: Promise.resolve({
                type: 'error',
                error: {
                    code: 'selection',
                    message: 'too few guardians',
                    detail: {
                        type: 'insufficientFmanSeats',
                        requested: 7,
                        selected: 2,
                        seen: 5,
                        eligible: 2,
                    },
                },
            }),
            fiClientEligiblePayers: Promise.resolve({
                type: 'payers',
                payers: [eligiblePayer],
            }),
        })

        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makeExpiredPreloadedState(),
                fedimint,
            },
        )

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.not-enough-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.quote-lost-guardians', {
                    requested: 7,
                    eligible: 2,
                }),
            ),
        ).toBeOnTheScreen()

        const changeGuardianCountButton = screen.getByTestId(
            'change-guardian-count-button',
        )
        expect(changeGuardianCountButton).toBeOnTheScreen()
        // one action, not two: going back re-quotes on focus, so the back path
        // is the retry path and a second button would only duplicate it
        expect(screen.queryByText(i18n.t('words.retry'))).toBeNull()
        // a lost-guardians quote is not payable; the send button is gone
        expect(screen.queryByTestId('SendConfirmButton')).toBeNull()

        await user.press(changeGuardianCountButton)
        expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
    })

    it('should unlock paying from the live balance when the payers snapshot is stale', () => {
        // regression: a top-up landed after the snapshot froze a zero balance;
        // the balance event alone must clear the banner and enable the button
        renderWithProviders(
            <ConfirmWalletService
                navigation={mockNavigation as any}
                route={{} as any}
            />,
            {
                preloadedState: makePreloadedState(
                    [eligiblePayer],
                    RICH_BALANCE_MSATS,
                ),
            },
        )

        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.insufficient-title'),
            ),
        ).toBeNull()
        expect(screen.getByTestId('SendConfirmButton')).toBeEnabled()
    })

    // Design call, 21 Aug (Miki 13:26, Keith 13:46): funding *unlocks* the
    // payment. It never makes it. The branch previously auto-paid once a
    // covering balance landed; these pin the replacement contract.
    describe('funding unlocks the payment without making it', () => {
        const VALID_UNTIL = Math.floor(Date.now() / 1000) + 300

        const makeFundingBridge = () =>
            createMockFedimintBridge({
                fiClientPreviewSelection: () =>
                    Promise.resolve({
                        type: 'preview',
                        preview: makePreview({
                            previewId: 'preview-refreshed',
                            totalAdvertisedMsats: TOTAL_MSATS,
                            validUntil: VALID_UNTIL,
                        }),
                    }),
                fiClientEligiblePayers: () =>
                    Promise.resolve({
                        type: 'payers',
                        payers: [eligiblePayer],
                    }),
                fiClientPayAndCreate: () =>
                    Promise.resolve({ type: 'success' }),
                // the top-up sheet asks the payer for a deposit invoice
                generateInvoice: () => Promise.resolve('lnbc1topup'),
            })

        const renderShort = (fedimint: ReturnType<typeof makeFundingBridge>) =>
            renderWithProviders(
                <ConfirmWalletService
                    navigation={mockNavigation as any}
                    route={{} as any}
                />,
                {
                    preloadedState: {
                        ...makePreloadedState(
                            [eligiblePayer],
                            BROKE_BALANCE_MSATS,
                        ),
                        fi: {
                            ...setupStore().getState().fi,
                            selectionPreview: makePreview({
                                validUntil: VALID_UNTIL,
                            }),
                            eligiblePayers: [eligiblePayer],
                        },
                    },
                    fedimint,
                },
            )

        /** Dismiss the sheet the way the backdrop does. */
        const dismissSheet = async () => {
            const modals = screen.UNSAFE_queryAllByType(Modal)
            await act(async () => {
                fireEvent(modals[modals.length - 1], 'requestClose')
            })
        }

        /** A deposit lands: the bridge emits a balance event into the store. */
        const fundPayer = async (
            store: ReturnType<typeof setupStore>,
            balanceMsats: number,
        ) => {
            await act(async () => {
                store.dispatch(
                    setFederations([
                        { ...mockFederation1, balance: balanceMsats as MSats },
                    ]),
                )
            })
        }

        // the safety-critical one: arriving with enough money must not spend it
        it('should not pay on its own when the user never asked to top up', async () => {
            const fedimint = makeFundingBridge()

            renderWithProviders(
                <ConfirmWalletService
                    navigation={mockNavigation as any}
                    route={{} as any}
                />,
                {
                    preloadedState: makePreloadedState(
                        [eligiblePayer],
                        RICH_BALANCE_MSATS,
                    ),
                    fedimint,
                },
            )

            await waitFor(() => {
                expect(screen.getByTestId('SendConfirmButton')).toBeEnabled()
            })
            expect(fedimint.fiClientPayAndCreate).not.toHaveBeenCalled()
        })

        it('should not pay merely because the user opened top up', async () => {
            const fedimint = makeFundingBridge()
            renderShort(fedimint)

            await user.press(screen.getByTestId('top-up-button'))
            await dismissSheet()

            expect(fedimint.fiClientPayAndCreate).not.toHaveBeenCalled()
        })

        // the whole point of the 21 Aug decision: money landing is not consent
        it('should not pay when a covering deposit lands after a top up', async () => {
            const fedimint = makeFundingBridge()
            const { store } = renderShort(fedimint)

            await user.press(screen.getByTestId('top-up-button'))
            await dismissSheet()
            await fundPayer(store, RICH_BALANCE_MSATS)

            await waitFor(() => {
                expect(screen.getByTestId('SendConfirmButton')).toBeEnabled()
            })
            expect(fedimint.fiClientPayAndCreate).not.toHaveBeenCalled()
        })

        // the refresh is what unlocks the button: the quote on screen may have
        // expired while the deposit was in flight, and an expired quote is not
        // payable
        it('should refresh the quote when the sheet reports funding', async () => {
            const fedimint = makeFundingBridge()
            const { store } = renderShort(fedimint)

            await user.press(screen.getByTestId('top-up-button'))
            const previewsBefore =
                fedimint.fiClientPreviewSelection.mock.calls.length

            // no other wallet can cover it, so the sheet skips the source list
            // and goes straight to the deposit invoice
            await user.press(screen.getByText(i18n.t('words.continue')))
            // the deposit lands while the invoice is on screen, which is the
            // sheet's own signal that funding is done — no press required
            await fundPayer(store, RICH_BALANCE_MSATS)

            await waitFor(() => {
                expect(
                    fedimint.fiClientPreviewSelection.mock.calls.length,
                ).toBeGreaterThan(previewsBefore)
            })
            expect(fedimint.fiClientPayAndCreate).not.toHaveBeenCalled()
            await waitFor(() => {
                expect(screen.getByTestId('SendConfirmButton')).toBeEnabled()
            })
        })

        // Reported from the simulator: wait on the invoice sheet, pay it, and
        // the screen answers with "Another Wallet Service operation is in
        // progress" for having done nothing but pay.
        //
        // The clock kept running behind the open sheet, so a lightning deposit
        // that outlived the 120s window fired the expiry refresh mid-payment.
        // When the payment then landed, `handleTopUpFunded` asked for a second
        // refresh in the same tick — and the bridge, which serves one FI
        // operation at a time, answered the second with `busy`.
        it('should not refresh behind the sheet or report busy when a deposit lands on an expired quote', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            jest.useFakeTimers().setSystemTime(nowSecs * 1000)
            const fedimint = makeFundingBridge()
            const { store } = renderWithProviders(
                <ConfirmWalletService
                    navigation={mockNavigation as any}
                    route={{} as any}
                />,
                {
                    preloadedState: {
                        ...makePreloadedState(
                            [eligiblePayer],
                            BROKE_BALANCE_MSATS,
                        ),
                        fi: {
                            ...setupStore().getState().fi,
                            selectionPreview: makePreview({
                                validUntil: nowSecs + 60,
                            }),
                            eligiblePayers: [eligiblePayer],
                        },
                    },
                    fedimint,
                },
            )

            await user.press(screen.getByTestId('top-up-button'))
            // no other wallet can cover it, so the sheet goes straight to the
            // deposit invoice
            await user.press(screen.getByText(i18n.t('words.continue')))
            const previewsBefore =
                fedimint.fiClientPreviewSelection.mock.calls.length

            // the deposit takes longer than the quote is good for
            await act(async () => {
                jest.advanceTimersByTime(120_000)
            })

            // the price is behind the sheet and cannot be acted on, so nothing
            // re-quotes it while the user is paying
            expect(fedimint.fiClientPreviewSelection.mock.calls.length).toBe(
                previewsBefore,
            )

            await fundPayer(store, RICH_BALANCE_MSATS)

            // exactly one refresh — the one that matters, on the way out. A
            // second in the same tick is what the bridge refuses as `busy`.
            await waitFor(() => {
                expect(
                    fedimint.fiClientPreviewSelection.mock.calls.length,
                ).toBe(previewsBefore + 1)
            })
            expect(mockToast.show).not.toHaveBeenCalled()

            jest.useRealTimers()
        })

        // The other half of the same bug. Stopping the clock behind the sheet
        // keeps the expiry refresh from starting *during* the payment, but a
        // refresh already running when the sheet was opened is still running
        // when the deposit lands — selection takes 30-60s, and the user can pay
        // an invoice faster than that. `handleTopUpFunded` asking for its own
        // refresh then is the second concurrent FI operation, which the bridge
        // refuses as `busy`.
        it('should join an in-flight refresh rather than asking the bridge for a second', async () => {
            let resolvePreview: (value: {
                type: 'preview'
                preview: RpcFiSelectionPreview
            }) => void = () => {}
            const fedimint = createMockFedimintBridge({
                // stays in flight for the whole test, the way a slow selection
                // walk does
                fiClientPreviewSelection: () =>
                    new Promise(resolve => {
                        resolvePreview = resolve
                    }),
                fiClientEligiblePayers: () =>
                    Promise.resolve({
                        type: 'payers',
                        payers: [eligiblePayer],
                    }),
                generateInvoice: () => Promise.resolve('lnbc1topup'),
            })

            const { store } = renderWithProviders(
                <ConfirmWalletService
                    navigation={mockNavigation as any}
                    route={{} as any}
                />,
                {
                    preloadedState: {
                        ...makePreloadedState(
                            [eligiblePayer],
                            BROKE_BALANCE_MSATS,
                        ),
                        fi: {
                            ...setupStore().getState().fi,
                            // already expired, so the mount's auto-refresh is
                            // in flight before the user opens the sheet
                            selectionPreview: makePreview({ validUntil: 1 }),
                            eligiblePayers: [eligiblePayer],
                        },
                    },
                    fedimint,
                },
            )

            await waitFor(() => {
                expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(
                    1,
                )
            })

            await user.press(screen.getByTestId('top-up-button'))
            await user.press(screen.getByText(i18n.t('words.continue')))
            await fundPayer(store, RICH_BALANCE_MSATS)

            // still one: the funding refresh joined the running one instead of
            // starting a second the bridge would refuse
            expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(1)
            expect(mockToast.show).not.toHaveBeenCalled()

            // let the pending selection settle so no promise is left hanging
            resolvePreview({ type: 'preview', preview: makePreview() })
            await waitFor(() => {
                expect(screen.queryByTestId('quote-refreshing')).toBeNull()
            })
        })

        // pressing it is the only thing that spends
        it('should pay only when the user presses pay and create', async () => {
            const fedimint = makeFundingBridge()
            const { store } = renderShort(fedimint)

            await user.press(screen.getByTestId('top-up-button'))
            await dismissSheet()
            await fundPayer(store, RICH_BALANCE_MSATS)

            await waitFor(() => {
                expect(screen.getByTestId('SendConfirmButton')).toBeEnabled()
            })
            await user.press(screen.getByTestId('SendConfirmButton'))

            await waitFor(() => {
                expect(fedimint.fiClientPayAndCreate).toHaveBeenCalledTimes(1)
            })
        })
    })
    // Flow A, storyboard row 1: the user is in no eligible wallet service.
    // The gate that used to block this flow is gone; the payment screen carries
    // the state and offers the way out of it.
    describe('joining an eligible wallet service', () => {
        const JOINABLE_ID = 'joinable-wallet-service'
        const JOINABLE_INVITE = 'fed1joinablewalletservice'

        const joinablePreloadedState = () => {
            const base = makePreloadedState([], 0)
            return {
                ...base,
                fi: { ...base.fi, eligiblePayers: [] as RpcFiEligiblePayer[] },
            }
        }

        const makeJoinBridge = () =>
            createMockFedimintBridge({
                fiClientEligiblePayers: () =>
                    Promise.resolve({ type: 'payers', payers: [] }),
                // the authenticated setup-payment set: one admitted member the
                // user is not in, which is the only thing that may be offered
                fiClientSetupPaymentFederations: () =>
                    Promise.resolve({
                        type: 'federations',
                        federations: [
                            {
                                federationId: JOINABLE_ID,
                                inviteCode: JOINABLE_INVITE,
                                joined: false,
                            },
                        ],
                    }),
                fiClientPreviewSelection: () =>
                    Promise.resolve({
                        type: 'preview',
                        preview: makePreview(),
                    }),
                federationPreview: () =>
                    Promise.resolve({
                        id: JOINABLE_ID,
                        name: 'Fedi Test Service',
                        inviteCode: JOINABLE_INVITE,
                        meta: {
                            federation_name: 'Fedi Test Service',
                            welcome_message: 'Welcome to Fedi Test Service',
                            // FederationPreview only offers accept/decline for
                            // a federation that publishes terms; without one it
                            // shows a single join button and there is nothing
                            // to decline
                            tos_url: 'https://example.test/terms',
                        },
                        returningMemberStatus: { type: 'newMember' },
                    }),
                joinFederation: () =>
                    Promise.resolve({
                        ...mockFederation1,
                        id: JOINABLE_ID,
                        name: 'Fedi Test Service',
                    }),
            })

        const renderNoPayer = (
            fedimint: ReturnType<typeof makeJoinBridge> = makeJoinBridge(),
        ) =>
            renderWithProviders(
                <ConfirmWalletService
                    navigation={mockNavigation as any}
                    route={{} as any}
                />,
                { preloadedState: joinablePreloadedState(), fedimint },
            )

        it('should price the setup and offer a join instead of a dead end', async () => {
            renderNoPayer()

            // the price is decoupled from the payer lookup and always renders
            expect(screen.getByTestId('total-setup-cost')).toBeOnTheScreen()
            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('SendConfirmButton')).toBeDisabled()
            // nothing to top up yet, so the top-up lever is not offered
            expect(screen.queryByTestId('top-up-button')).toBeNull()
            // the old gate's only action was a toast; nothing here claims success
            expect(mockToast.show).not.toHaveBeenCalled()
        })

        // The screen's offer does not depend on the lookup, so a lookup that
        // never answers cannot change what the screen says. This is what makes
        // reopening the sheet a retry: there is always something to press.
        it('should keep offering the join while the lookup never answers', async () => {
            const fedimint = createMockFedimintBridge({
                fiClientEligiblePayers: () =>
                    Promise.resolve({ type: 'payers', payers: [] }),
                fiClientPreviewSelection: () =>
                    Promise.resolve({
                        type: 'preview',
                        preview: makePreview(),
                    }),
                // never settles: the lookup stays pending for the whole test
                fiClientSetupPaymentFederations: () => new Promise(() => {}),
            })
            renderNoPayer(fedimint)

            expect(screen.getByTestId('total-setup-cost')).toBeOnTheScreen()
            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('open-join-sheet-button')).toBeEnabled()
            // the sheet reports the wait; the screen states no verdict
            expect(screen.getByTestId('join-sheet-loading')).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t(
                        'feature.wallet-service.no-trusted-federation-title',
                    ),
                ),
            ).toBeNull()
            expect(screen.queryByTestId('return-home-button')).toBeNull()
        })

        // With nothing to pay from, the user's next move is a join and a
        // top-up, which outlasts any 120s quote. A clock here expired into a
        // dead "Quote expired" line and armed the auto-refresh to re-run the
        // most expensive RPC there is, for a price nobody could act on.
        it('should not run the quote clock when there is no wallet to pay from', async () => {
            const fedimint = makeJoinBridge()
            const base = joinablePreloadedState()
            renderWithProviders(
                <ConfirmWalletService
                    navigation={mockNavigation as any}
                    route={{} as any}
                />,
                {
                    preloadedState: {
                        ...base,
                        fi: {
                            ...base.fi,
                            selectionPreview: makePreview({ validUntil: 1 }),
                        },
                    },
                    fedimint,
                },
            )

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
            expect(screen.queryByTestId('quote-expired')).toBeNull()
            expect(screen.queryByTestId('quote-countdown')).toBeNull()
            expect(screen.queryByTestId('quote-refreshing')).toBeNull()
            // the auto-refresh never armed, so the expensive selection RPC
            // was not re-run
            expect(fedimint.fiClientPreviewSelection).not.toHaveBeenCalled()
        })

        // the join card is an offer to join, so a member already joined must
        // not appear in it — that is what left the panel up after a join
        it('should not offer a trusted federation the user already joined', async () => {
            const fedimint = createMockFedimintBridge({
                fiClientEligiblePayers: () =>
                    Promise.resolve({ type: 'payers', payers: [] }),
                fiClientPreviewSelection: () =>
                    Promise.resolve({
                        type: 'preview',
                        preview: makePreview(),
                    }),
                fiClientSetupPaymentFederations: () =>
                    Promise.resolve({
                        type: 'federations',
                        federations: [
                            {
                                federationId: JOINABLE_ID,
                                inviteCode: JOINABLE_INVITE,
                                joined: true,
                            },
                        ],
                    }),
            })
            renderNoPayer(fedimint)

            // the sheet carries the verdict; the screen keeps its offer so the
            // sheet can be opened again
            expect(
                await screen.findByTestId('join-sheet-empty'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId(`join-wallet-service-${JOINABLE_ID}`),
            ).toBeNull()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
        })

        // an empty admitted set is a real authenticated answer, not a failure,
        // and no other federation list may be substituted for it
        it('should offer no join when the admitted set is empty', async () => {
            const fedimint = createMockFedimintBridge({
                fiClientEligiblePayers: () =>
                    Promise.resolve({ type: 'payers', payers: [] }),
                fiClientPreviewSelection: () =>
                    Promise.resolve({
                        type: 'preview',
                        preview: makePreview(),
                    }),
                fiClientSetupPaymentFederations: () =>
                    Promise.resolve({ type: 'federations', federations: [] }),
            })
            renderNoPayer(fedimint)

            expect(
                await screen.findByTestId('join-sheet-empty'),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t(
                        'feature.wallet-service.no-trusted-federation-title',
                    ),
                ),
            ).toBeOnTheScreen()
            // the offer survives the verdict, so Check again has somewhere to
            // return to and the sheet can be reopened
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
        })

        // the bridge can name payers the app does not hold — a real state, and
        // the same predicament as trusting none of them
        it('should offer the join card when the named payers are not held', async () => {
            const base = joinablePreloadedState()
            renderWithProviders(
                <ConfirmWalletService
                    navigation={mockNavigation as any}
                    route={{} as any}
                />,
                {
                    preloadedState: {
                        ...base,
                        fi: {
                            ...base.fi,
                            // payers exist, but none of them is a wallet held
                            eligiblePayers: [
                                {
                                    federationId: 'a-wallet-we-are-not-in',
                                    balanceMsats: '900000000',
                                },
                            ],
                        },
                    },
                    fedimint: makeJoinBridge(),
                },
            )

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
        })

        it('should put the federation terms on screen when a service is chosen', async () => {
            renderNoPayer()

            await user.press(
                await screen.findByTestId('open-join-sheet-button'),
            )
            await user.press(
                await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
            )

            // the onboarding preview, reused verbatim
            expect(
                await screen.findByText(i18n.t('feature.onboarding.i-accept')),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(i18n.t('feature.onboarding.i-do-not-accept')),
            ).toBeOnTheScreen()
        })

        /**
         * The sheet dismisses on the press but the terms are a network round
         * trip away, so the user lands back on a card that was still offering
         * the join it had just started — and pressing it reopened the sheet on
         * top of the join in flight.
         */
        it('should trade the join offer for a spinner while the terms are fetched', async () => {
            const fedimint = makeJoinBridge()
            const previewMock = fedimint.federationPreview as jest.Mock
            // the implementation, not the mock itself: `mockImplementation`
            // replaces what the mock does, so delegating to the mock would
            // call this wrapper again
            const fetchPreview = previewMock.getMockImplementation() as (
                ...args: unknown[]
            ) => Promise<unknown>
            // slow enough that the gap between the sheet closing and the terms
            // arriving is a state the test can look at, rather than a frame
            previewMock.mockImplementation(
                (...args: unknown[]) =>
                    new Promise(resolve => {
                        setTimeout(() => resolve(fetchPreview(...args)), 200)
                    }),
            )
            renderNoPayer(fedimint)

            await user.press(
                await screen.findByTestId('open-join-sheet-button'),
            )
            // `fireEvent`, not `user.press`: the press starts a fetch that is
            // deliberately left hanging, and `userEvent` waits the press out
            fireEvent.press(
                await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
            )

            // the card is still there — it is the offer that goes, and the
            // journey's ring stands in its place
            expect(
                await screen.findByTestId('join-card-busy'),
            ).toBeOnTheScreen()
            expect(screen.queryByTestId('open-join-sheet-button')).toBeNull()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()

            // and the terms still arrive
            expect(
                await screen.findByText(i18n.t('feature.onboarding.i-accept')),
            ).toBeOnTheScreen()
        })

        // joining takes seconds and the payer poll that follows takes seconds
        // more, with the card on screen throughout because there is still no
        // payer. The spinner has to cover that too, or the dead button is back.
        it('should keep the spinner up while the joined wallet becomes a payer', async () => {
            const fedimint = makeJoinBridge()
            renderNoPayer(fedimint)

            await user.press(
                await screen.findByTestId('open-join-sheet-button'),
            )
            await user.press(
                await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
            )
            await user.press(
                await screen.findByText(i18n.t('feature.onboarding.i-accept')),
            )

            await waitFor(() => {
                expect(fedimint.joinFederation).toHaveBeenCalled()
            })
            // back on the confirm screen, still no payer, still no offer
            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('join-card-busy')).toBeOnTheScreen()
            expect(screen.queryByTestId('open-join-sheet-button')).toBeNull()
        })

        it('should return to the list when the terms are declined', async () => {
            const fedimint = makeJoinBridge()
            renderNoPayer(fedimint)

            await user.press(
                await screen.findByTestId('open-join-sheet-button'),
            )
            await user.press(
                await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
            )
            await user.press(
                await screen.findByText(
                    i18n.t('feature.onboarding.i-do-not-accept'),
                ),
            )

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-sheet-title'),
                ),
            ).toBeOnTheScreen()
            expect(fedimint.joinFederation).not.toHaveBeenCalled()
            // a join that went nowhere leaves the card pressable again, so
            // closing the sheet is not a dead end
            expect(
                screen.getByTestId('open-join-sheet-button'),
            ).toBeOnTheScreen()
            expect(screen.queryByTestId('join-card-busy')).toBeNull()
        })

        // the default stack back pops the route, which would abandon the whole
        // payment step from a screen opened only to read some terms
        it('should treat going back from the terms as declining them', async () => {
            const fedimint = makeJoinBridge()
            renderNoPayer(fedimint)

            await user.press(
                await screen.findByTestId('open-join-sheet-button'),
            )
            await user.press(
                await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
            )
            await screen.findByText(i18n.t('feature.onboarding.i-accept'))

            // the terms carry the journey's own header now, so the back is
            // the same chevron as every other wallet service step
            await user.press(screen.getByTestId('HeaderBackButton'))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-sheet-title'),
                ),
            ).toBeOnTheScreen()
            expect(mockNavigation.goBack).not.toHaveBeenCalled()
        })

        // decision ④, 21 Aug: accepting joins *and* opens the top-up, prefilled
        it('should open the top up sheet on the full setup cost after joining', async () => {
            const fedimint = makeJoinBridge()
            renderNoPayer(fedimint)

            await user.press(
                await screen.findByTestId('open-join-sheet-button'),
            )
            await user.press(
                await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
            )
            await user.press(
                await screen.findByText(i18n.t('feature.onboarding.i-accept')),
            )

            await waitFor(() => {
                expect(fedimint.joinFederation).toHaveBeenCalledWith(
                    JOINABLE_INVITE,
                    false,
                )
            })
            expect(mockToast.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: i18n.t(
                        'feature.wallet-service.joined-top-up-next',
                        { federation: 'Fedi Test Service' },
                    ),
                    status: 'success',
                }),
            )
        })

        // Regression: the wallet is joined, but the bridge's payer lookup only
        // reads fully loaded wallets, so the refresh that runs straight after
        // `joinFederation` can legitimately answer "no payer" about the wallet
        // the user has just joined. Nothing used to ask again, which left the
        // join card offering a federation the user was already in, above a
        // dead `Pay & create` and no way to fund it.
        it('should recover the payer when the joined wallet loads after the first lookup', async () => {
            let payerLookups = 0
            const fedimint = createMockFedimintBridge({
                ...makeJoinBridge(),
                // first answer is the racy one: the wallet exists but is not
                // loaded yet, so the bridge omits it
                // the payer that turns up is the loaded wallet the preloaded
                // state already holds: the bridge names a wallet only once it
                // is loaded, which is the whole race being modelled
                fiClientEligiblePayers: () => {
                    payerLookups += 1
                    return Promise.resolve(
                        payerLookups === 1
                            ? { type: 'payers', payers: [] }
                            : { type: 'payers', payers: [eligiblePayer] },
                    )
                },
            })
            renderNoPayer(fedimint)

            await user.press(
                await screen.findByTestId('open-join-sheet-button'),
            )
            await user.press(
                await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
            )
            await user.press(
                await screen.findByText(i18n.t('feature.onboarding.i-accept')),
            )

            // the second lookup is the whole fix: without it the screen keeps
            // the pre-join state forever
            await waitFor(
                () => {
                    expect(payerLookups).toBeGreaterThan(1)
                },
                { timeout: 10000 },
            )

            // a payer with nothing in it: the one thing to do is fund it, so
            // that is the button, and the join offer is gone
            expect(
                await screen.findByTestId('top-up-button', undefined, {
                    timeout: 10000,
                }),
            ).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeNull()
            // the poll stops as soon as the payer arrives rather than running
            // out its attempts
            const settledLookups = payerLookups
            await new Promise(resolve => setTimeout(resolve, 4000))
            expect(payerLookups).toBe(settledLookups)
        }, 30000)
    })
})
