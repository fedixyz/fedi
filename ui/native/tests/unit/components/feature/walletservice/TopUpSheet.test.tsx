import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import {
    createMockFedimintBridge,
    type MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import type { LoadedFederation, MSats } from '@fedi/common/types'

import TopUpSheet, {
    roundUpTopUpSats,
} from '../../../../../components/feature/walletservice/TopUpSheet'
import i18n from '../../../../../localization/i18n'
import { mockAppState } from '../../../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../../../utils/render'

// the QR renderer pulls in native-only modules (view-shot, the node build of
// `qrcode`) that the shared setup does not stub; the invoice string is what
// this sheet is responsible for, not the pixels
jest.mock('../../../../../components/ui/QRCode', () => 'QRCode')

// 1,734 sats owed against 500 sats held leaves a 1,234 sat shortfall, which
// rounds up to a 2,000 sat ask
const TOTAL_MSATS = '1734000'
const AVAILABLE_MSATS = '500000'

const makeFederation = (
    id: string,
    name: string,
    balance: number,
): LoadedFederation =>
    ({
        ...mockFederation1,
        id,
        name,
        inviteCode: `invite-${id}`,
        balance: balance as MSats,
    }) as LoadedFederation

const payerFederation = makeFederation('payer', 'Payer Wallet', 500_000)

const makePreloadedState = (federations: LoadedFederation[]) => {
    const state = setupStore().getState()
    return {
        environment: {
            ...state.environment,
            transactionDisplayType: 'sats' as const,
            amountInputType: 'sats' as const,
        },
        federation: {
            ...state.federation,
            federations: [payerFederation, ...federations],
            payFromFederationId: payerFederation.id,
        },
    }
}

// pushes a bridge transaction event into every 'transaction' listener the
// sheet has registered, and reports how many listeners there were
const emitTransaction = (
    fedimint: MockFedimintBridge,
    transaction: Record<string, unknown>,
) => {
    const listeners = fedimint.addListener.mock.calls
        .filter(([event]) => event === 'transaction')
        .map(
            ([, listener]) => listener as (e: { transaction: unknown }) => void,
        )
    listeners.forEach(listener => listener({ transaction }))
    return listeners.length
}

const makeClaimedDeposit = (invoice: string, state = { type: 'claimed' }) => ({
    id: 'txn-top-up',
    kind: 'lnReceive',
    ln_invoice: invoice,
    state,
    amount: 2_000_000,
    outcomeTime: 1,
})

const renderSheet = (
    federations: LoadedFederation[],
    fedimint = createMockFedimintBridge(),
    onFunded = jest.fn(),
    availableMsats = AVAILABLE_MSATS,
) => {
    const rendered = renderWithProviders(
        <TopUpSheet
            show
            onDismiss={jest.fn()}
            onFunded={onFunded}
            totalMsats={TOTAL_MSATS}
            availableMsats={availableMsats}
            payerFederationId={payerFederation.id}
            payerFederationName={payerFederation.name}
        />,
        { preloadedState: makePreloadedState(federations), fedimint },
    )
    return { ...rendered, fedimint, onFunded }
}

/** Reach the deposit invoice, which is where all the recovery paths live. */
const openInvoiceView = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.press(screen.getByText(i18n.t('words.continue')))
    await screen.findByText(i18n.t('feature.wallet-service.topup-waiting'))
}

describe('components/feature/walletservice/TopUpSheet', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
        mockAppState.reset()
    })

    afterEach(() => {
        cleanup()
    })

    describe('roundUpTopUpSats', () => {
        it('should round the shortfall up to the next 1,000 sats', () => {
            expect(roundUpTopUpSats(1_234)).toBe(2_000)
            expect(roundUpTopUpSats(2_001)).toBe(3_000)
        })

        /**
         * The deposit arrives net of the lightning module's `receivePpm`, and
         * `canPay` wants the full cost with no tolerance. Asking for exactly
         * the shortfall lands a few sats under it, so a round shortfall — a
         * 21,000-sat cost against an empty wallet — goes up a step rather than
         * asking for the exact figure it will not receive.
         */
        it('should leave headroom for the receive fee on a round shortfall', () => {
            expect(roundUpTopUpSats(2_000)).toBe(3_000)
            expect(roundUpTopUpSats(21_000)).toBe(22_000)
        })

        // rounding alone would have left this one a single sat of margin
        it('should take another step when rounding leaves too little margin', () => {
            expect(roundUpTopUpSats(21_999)).toBe(23_000)
            expect(roundUpTopUpSats(21_950)).toBe(23_000)
            expect(roundUpTopUpSats(21_900)).toBe(22_000)
        })

        // every ask clears the shortfall by at least the headroom floor
        it('should always exceed the shortfall by at least 100 sats', () => {
            for (let owed = 0; owed <= 3_000; owed += 1) {
                expect(roundUpTopUpSats(owed) - owed).toBeGreaterThanOrEqual(
                    100,
                )
            }
        })

        it('should never ask for less than 1,000 sats', () => {
            expect(roundUpTopUpSats(0)).toBe(1_000)
            expect(roundUpTopUpSats(1)).toBe(1_000)
        })
    })

    // `AmountInput` brings its own keypad, so anything stacked above it pushes
    // the keypad off the bottom of the sheet. The shortfall is carried by the
    // prefilled amount instead, and by the banner on the screen behind.
    it('should leave the receipt off the From/To surface', () => {
        renderSheet([])

        // the destination and its balance are on the To row, and the ask is
        // prefilled with the shortfall — the three summary rows only pushed
        // the keypad off the bottom
        expect(screen.getByTestId('topup-destination')).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.total-setup-cost'),
            ),
        ).toBeNull()
    })

    // decision ②, 21 Aug: the payer is predetermined, so To is a statement
    // rather than a choice
    it('should show the destination as fixed and unpressable', () => {
        renderSheet([makeFederation('rich', 'Rich Wallet', 2_000_000)])

        const destination = screen.getByTestId('topup-destination')
        expect(destination).toBeOnTheScreen()
        expect(destination.props.onPress).toBeUndefined()
        expect(
            screen.getByText(i18n.t('feature.wallet-service.topup-to-fixed')),
        ).toBeOnTheScreen()
    })

    // pressing Send should be the only thing left to do in the common case
    it('should default the source to the best funded qualifying wallet', () => {
        renderSheet([
            makeFederation('ok', 'Just Enough Wallet', 2_000_000),
            makeFederation('rich', 'Rich Wallet', 9_000_000),
        ])

        expect(screen.getByText('Rich Wallet')).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.send'))).toBeOnTheScreen()
    })

    it('should offer only other federations that cover the rounded up ask in full', async () => {
        // the ask is 2,000 sats, so 2,000,000 msats covers it and 1,999,999 does not
        renderSheet([
            makeFederation('rich', 'Rich Wallet', 2_000_000),
            makeFederation('poor', 'Poor Wallet', 1_999_999),
        ])

        await user.press(screen.getByTestId('topup-source'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-source-title', {
                    amount: '2,000 SATS',
                }),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByText('Rich Wallet')).toBeOnTheScreen()
        expect(screen.queryByText('Poor Wallet')).toBeNull()
        // the wallet that is short is what we are topping up, never a source
        expect(screen.queryByText(payerFederation.name)).toBeNull()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.topup-source-external'),
            ),
        ).toBeOnTheScreen()
    })

    // decision ④, 21 Aug: V3.5 moved the money the moment a row was tapped
    it('should choose a source without moving anything', async () => {
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
            payInvoice: Promise.resolve({}),
        })
        renderSheet(
            [
                makeFederation('rich', 'Rich Wallet', 9_000_000),
                makeFederation('ok', 'Just Enough Wallet', 2_000_000),
            ],
            fedimint,
        )

        await user.press(screen.getByTestId('topup-source'))
        await user.press(await screen.findByTestId('topup-source-ok'))

        // back on the From/To surface with the new source, nothing sent
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-to-fixed'),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByText('Just Enough Wallet')).toBeOnTheScreen()
        expect(fedimint.payInvoice).not.toHaveBeenCalled()
        expect(fedimint.generateInvoice).not.toHaveBeenCalled()
    })

    /**
     * The sheet mounts once with the screen and is only hidden between uses, so
     * it used to reopen wherever it was left: a second Top up landed straight
     * back on the first transfer's "Funds moved", over a stale invoice the
     * transaction listener was still watching.
     */
    it('should start over when it is reopened', async () => {
        const props = {
            onDismiss: jest.fn(),
            onFunded: jest.fn(),
            totalMsats: TOTAL_MSATS,
            availableMsats: AVAILABLE_MSATS,
            payerFederationId: payerFederation.id,
            payerFederationName: payerFederation.name,
        }
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
        })
        const { rerender } = renderWithProviders(
            <TopUpSheet show {...props} />,
            { preloadedState: makePreloadedState([]), fedimint },
        )

        // no other wallet qualifies, so Continue opens a deposit invoice
        await user.press(screen.getByText(i18n.t('words.continue')))
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-waiting'),
            ),
        ).toBeOnTheScreen()

        rerender(<TopUpSheet show={false} {...props} />)
        rerender(<TopUpSheet show {...props} />)

        expect(
            screen.getByText(i18n.t('feature.wallet-service.topup-title')),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.wallet-service.topup-waiting')),
        ).toBeNull()
    })

    it('should open a lightning invoice when the source is an external wallet', async () => {
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
        })
        renderSheet(
            [makeFederation('rich', 'Rich Wallet', 2_000_000)],
            fedimint,
        )

        await user.press(screen.getByTestId('topup-source'))
        await user.press(await screen.findByTestId('topup-source-external'))
        // an external deposit only opens an invoice, so it is not called Send
        await user.press(screen.getByText(i18n.t('words.continue')))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-waiting'),
            ),
        ).toBeOnTheScreen()
    })

    it('should skip straight to a lightning invoice when no federation qualifies', async () => {
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
        })
        renderSheet([makeFederation('poor', 'Poor Wallet', 1_000)], fedimint)

        await user.press(screen.getByText(i18n.t('words.continue')))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-waiting'),
            ),
        ).toBeOnTheScreen()
        expect(fedimint.generateInvoice).toHaveBeenCalledWith(
            2_000_000,
            i18n.t('phrases.wallet-service'),
            payerFederation.id,
            null,
        )
    })

    /**
     * Reported from a device: the QR code felt slow here and quick on the
     * Wallet tab, though both take the same `generateInvoice` round trip. The
     * sheet used to open the invoice view first and await the invoice on it, so
     * the whole wait happened inside an empty QR frame and read as a slow QR.
     * The Wallet tab holds its amount screen instead and only navigates once
     * the invoice exists, which is what this asserts.
     */
    it('should hold the amount view until the invoice arrives', async () => {
        let releaseInvoice: (invoice: string) => void = () => undefined
        const fedimint = createMockFedimintBridge({
            generateInvoice: new Promise<string>(resolve => {
                releaseInvoice = resolve
            }),
            listFederations: () => Promise.resolve([]),
        })
        renderSheet([makeFederation('poor', 'Poor Wallet', 1_000)], fedimint)

        await user.press(screen.getByText(i18n.t('words.continue')))

        // the request is out, but the invoice view must not be on screen yet
        expect(fedimint.generateInvoice).toHaveBeenCalledTimes(1)
        expect(
            screen.queryByText(i18n.t('feature.wallet-service.topup-waiting')),
        ).toBeNull()
        // and because the invoice view is what starts the balance resync, that
        // resync is no longer on the wire alongside the invoice request either
        expect(fedimint.listFederations).not.toHaveBeenCalled()

        await act(async () => {
            releaseInvoice('lnbc-top-up')
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-waiting'),
            ),
        ).toBeOnTheScreen()
    })

    // the invoice is now awaited from the amount view, so a failure has no
    // invoice view to fall back off — it stays where it was pressed
    it('should stay on the amount view when the invoice fails', async () => {
        const fedimint = createMockFedimintBridge({
            generateInvoice: () => Promise.reject(new Error('no gateway')),
        })
        renderSheet([makeFederation('poor', 'Poor Wallet', 1_000)], fedimint)

        await user.press(screen.getByText(i18n.t('words.continue')))

        await waitFor(() => {
            expect(fedimint.generateInvoice).toHaveBeenCalledTimes(1)
        })
        expect(
            screen.queryByText(i18n.t('feature.wallet-service.topup-waiting')),
        ).toBeNull()
        expect(screen.getByTestId('topup-destination')).toBeOnTheScreen()
    })

    it('should move funds from the chosen federation into the paying wallet', async () => {
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
            payInvoice: Promise.resolve({}),
        })
        renderSheet(
            [makeFederation('rich', 'Rich Wallet', 2_000_000)],
            fedimint,
        )

        await user.press(screen.getByText(i18n.t('words.send')))

        await waitFor(() => {
            expect(fedimint.payInvoice).toHaveBeenCalledWith(
                'lnbc-top-up',
                'rich',
            )
        })
        expect(fedimint.generateInvoice).toHaveBeenCalledWith(
            2_000_000,
            i18n.t('phrases.wallet-service'),
            payerFederation.id,
            null,
        )
    })

    it('should hand back to the confirm screen without paying for setup', async () => {
        const onFunded = jest.fn()
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
            payInvoice: Promise.resolve({}),
            fiClientPayAndCreate: Promise.resolve({ type: 'success' }),
        })
        renderSheet(
            [makeFederation('rich', 'Rich Wallet', 2_000_000)],
            fedimint,
            onFunded,
        )

        await user.press(screen.getByText(i18n.t('words.send')))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-moved'),
            ),
        ).toBeOnTheScreen()

        await user.press(screen.getByText(i18n.t('words.continue')))

        expect(onFunded).toHaveBeenCalledTimes(1)
        expect(fedimint.fiClientPayAndCreate).not.toHaveBeenCalled()
    })

    it('should hand back on its own when the claimed deposit matches the invoice', async () => {
        const onFunded = jest.fn()
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
        })
        renderSheet([], fedimint, onFunded)

        // the amount view listens for nothing: a deposit that lands while the
        // invoice is not on screen must not trigger the flow
        expect(
            emitTransaction(fedimint, makeClaimedDeposit('lnbc-top-up')),
        ).toBe(0)
        expect(onFunded).not.toHaveBeenCalled()

        await user.press(screen.getByText(i18n.t('words.continue')))
        await screen.findByText(i18n.t('feature.wallet-service.topup-waiting'))

        expect(
            emitTransaction(fedimint, makeClaimedDeposit('lnbc-top-up')),
        ).toBeGreaterThan(0)
        expect(onFunded).toHaveBeenCalledTimes(1)
    })

    it('should keep waiting for deposits that are not the claimed invoice', async () => {
        const onFunded = jest.fn()
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
        })
        renderSheet([], fedimint, onFunded)

        await user.press(screen.getByText(i18n.t('words.continue')))
        await screen.findByText(i18n.t('feature.wallet-service.topup-waiting'))

        // same invoice but not yet settled
        emitTransaction(
            fedimint,
            makeClaimedDeposit('lnbc-top-up', {
                type: 'waitingForPayment',
            }),
        )
        // settled but a different invoice
        emitTransaction(fedimint, makeClaimedDeposit('lnbc-someone-else'))

        expect(onFunded).not.toHaveBeenCalled()
    })

    /**
     * Reported from a device: background the app to pay the invoice, and the
     * sheet is still showing the QR code on the way back in.
     *
     * A suspended JS thread never receives the one `transaction` event the
     * sheet was waiting on, so the edge is lost and nothing re-derived the
     * state from it. These are the three checks that cover the loss.
     */
    describe('recovering a deposit the transaction event missed', () => {
        it('should hand back when the balance covers the cost without any event', async () => {
            const onFunded = jest.fn()
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
            })
            renderSheet([], fedimint, onFunded)

            await openInvoiceView(user)
            expect(onFunded).not.toHaveBeenCalled()

            // the balance the confirm screen hands down catches up, which is
            // all the proof of funding this screen needs
            await act(async () => {
                screen.rerender(
                    <TopUpSheet
                        show
                        onDismiss={jest.fn()}
                        onFunded={onFunded}
                        totalMsats={TOTAL_MSATS}
                        availableMsats={TOTAL_MSATS}
                        payerFederationId={payerFederation.id}
                        payerFederationName={payerFederation.name}
                    />,
                )
            })

            expect(onFunded).toHaveBeenCalledTimes(1)
        })

        it('should re-read balances from the bridge when the app returns to the foreground', async () => {
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                // the payer, unchanged: this check is about the bridge being
                // asked at all, not about what it answers
                listFederations: () => Promise.resolve([]),
            })
            renderSheet([], fedimint)

            await openInvoiceView(user)
            const readsBefore = fedimint.listFederations.mock.calls.length

            await act(async () => {
                mockAppState.background()
            })
            // nothing is asked of a bridge the app cannot hear the answer from
            expect(fedimint.listFederations.mock.calls.length).toBe(readsBefore)

            await act(async () => {
                mockAppState.foreground()
            })

            await waitFor(() => {
                expect(
                    fedimint.listFederations.mock.calls.length,
                ).toBeGreaterThan(readsBefore)
            })
        })

        it('should find the claimed deposit by polling the payer transactions', async () => {
            const onFunded = jest.fn()
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                listTransactions: Promise.resolve([
                    { Ok: makeClaimedDeposit('lnbc-top-up') },
                ]),
            })
            renderSheet([], fedimint, onFunded)

            await openInvoiceView(user)

            // the poll is the only check that names the invoice, so it still
            // answers when no event and no balance update ever arrive
            await waitFor(
                () => {
                    expect(onFunded).toHaveBeenCalledTimes(1)
                },
                { timeout: 10000 },
            )
            expect(fedimint.listTransactions).toHaveBeenCalledWith(
                payerFederation.id,
                undefined,
                10,
            )
        }, 15000)

        // four checks, one hand-off: `onFunded` closes the sheet and re-quotes
        // the price, and the bridge refuses a second selection as `busy`
        it('should hand back exactly once when several checks agree', async () => {
            const onFunded = jest.fn()
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                listTransactions: Promise.resolve([
                    { Ok: makeClaimedDeposit('lnbc-top-up') },
                ]),
            })
            renderSheet([], fedimint, onFunded)

            await openInvoiceView(user)
            emitTransaction(fedimint, makeClaimedDeposit('lnbc-top-up'))

            await waitFor(
                () => {
                    expect(fedimint.listTransactions).toHaveBeenCalled()
                },
                { timeout: 10000 },
            )
            await user.press(
                screen.getByText(
                    i18n.t('feature.wallet-service.topup-ive-paid'),
                ),
            )

            expect(onFunded).toHaveBeenCalledTimes(1)
        }, 15000)

        it('should stop polling once the sheet leaves the invoice view', async () => {
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
            })
            renderSheet([], fedimint)

            await openInvoiceView(user)
            await waitFor(
                () => {
                    expect(fedimint.listTransactions).toHaveBeenCalled()
                },
                { timeout: 10000 },
            )

            await act(async () => {
                mockAppState.background()
            })
            const pollsWhileAsleep = fedimint.listTransactions.mock.calls.length

            // a poll that outlives the screen it belongs to is a timer nobody
            // owns, so backgrounding has to stop it
            await new Promise(resolve => setTimeout(resolve, 6000))
            expect(fedimint.listTransactions.mock.calls.length).toBe(
                pollsWhileAsleep,
            )
        }, 15000)
    })
})
