import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import { setupStore, setWalletServiceTopUpInvoice } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import {
    createMockFedimintBridge,
    type MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import type { LoadedFederation, MSats } from '@fedi/common/types'
import { BridgeError } from '@fedi/common/utils/errors'

import TopUpSheet, {
    roundUpTopUpSats,
} from '../../../../../components/feature/walletservice/TopUpSheet'
import i18n from '../../../../../localization/i18n'
import { mockAppState, mockToast } from '../../../../setup/jest.setup.mocks'
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

/** The payer, charging `sendPpm` on every ecash spend out of it. */
const payerChargingSendPpm = (sendPpm: number): LoadedFederation => ({
    ...payerFederation,
    fediFeeSchedule: {
        ...payerFederation.fediFeeSchedule,
        modules: { mint: { sendPpm, receivePpm: 0 } },
    },
})

const makePreloadedState = (
    federations: LoadedFederation[],
    payer: LoadedFederation = payerFederation,
) => {
    const state = setupStore().getState()
    return {
        environment: {
            ...state.environment,
            transactionDisplayType: 'sats' as const,
            amountInputType: 'sats' as const,
        },
        federation: {
            ...state.federation,
            federations: [payer, ...federations],
            payFromFederationId: payer.id,
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
    payer = payerFederation,
) => {
    const rendered = renderWithProviders(
        <TopUpSheet
            show
            onDismiss={jest.fn()}
            onFunded={onFunded}
            totalMsats={TOTAL_MSATS}
            availableMsats={availableMsats}
            payerFederationId={payer.id}
            payerFederationName={payer.name}
        />,
        { preloadedState: makePreloadedState(federations, payer), fedimint },
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

    /**
     * `selectCanPayForWalletService` unlocks the pay button at
     * `balance >= total` exactly, so a wallet funded to the quoted total came
     * up short on the spend that followed.
     */
    describe('the send fee on spending the deposit', () => {
        // an 890 sat gap rounds to 1,000 alone; +18 for the fee leaves less
        // than TOP_UP_MIN_HEADROOM_SATS under it, so the ask steps up
        const AVAILABLE_WITH_SMALL_GAP_MSATS = '844000'

        // the source picker names the exact ask
        const expectAskToBe = async (sats: string) => {
            await user.press(screen.getByTestId('topup-source'))
            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-source-title', {
                        amount: `${sats} SATS`,
                    }),
                ),
            ).toBeOnTheScreen()
        }

        it('should ask for the shortfall alone when the payer charges nothing', async () => {
            renderSheet(
                [makeFederation('rich', 'Rich Wallet', 9_000_000)],
                createMockFedimintBridge(),
                jest.fn(),
                AVAILABLE_WITH_SMALL_GAP_MSATS,
            )

            await expectAskToBe('1,000')
        })

        it('should add the payer send fee to the shortfall', async () => {
            renderSheet(
                [makeFederation('rich', 'Rich Wallet', 9_000_000)],
                createMockFedimintBridge(),
                jest.fn(),
                AVAILABLE_WITH_SMALL_GAP_MSATS,
                payerChargingSendPpm(10_000),
            )

            await expectAskToBe('2,000')
        })
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

    it('should offer a wallet that covers only part of the ask', async () => {
        // the ask is 2,000 sats. A wallet holding 500 used to be left out
        // entirely, which emptied the From row and sent the user out of the
        // flow for a lightning deposit
        renderSheet([
            makeFederation('rich', 'Rich Wallet', 9_000_000),
            makeFederation('part', 'Part Wallet', 500_000),
        ])

        await user.press(screen.getByTestId('topup-source'))

        expect(await screen.findByText('Rich Wallet')).toBeOnTheScreen()
        expect(screen.getByText('Part Wallet')).toBeOnTheScreen()
        // the wallet that is short is what we are topping up, never a source
        expect(screen.queryByText(payerFederation.name)).toBeNull()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.topup-source-external'),
            ),
        ).toBeOnTheScreen()
    })

    it('should leave out a wallet that cannot cover the send reserve', async () => {
        // 60 sats cannot pay any invoice once routing is allowed for, so
        // offering it would only promise a transfer that must fail
        renderSheet([
            makeFederation('rich', 'Rich Wallet', 9_000_000),
            makeFederation('dust', 'Dust Wallet', 60_000),
        ])

        await user.press(screen.getByTestId('topup-source'))

        expect(await screen.findByText('Rich Wallet')).toBeOnTheScreen()
        expect(screen.queryByText('Dust Wallet')).toBeNull()
    })

    it('should show the lowered ask after switching to a smaller wallet', async () => {
        // the amount input seeds its displayed value once, so a clamp that
        // arrived a commit later left the 2,000 sat ask on screen while only
        // 400 would move
        renderSheet([
            makeFederation('rich', 'Rich Wallet', 9_000_000),
            makeFederation('part', 'Part Wallet', 500_000),
        ])

        expect(screen.getByText('2,000')).toBeOnTheScreen()

        await user.press(screen.getByTestId('topup-source'))
        await user.press(await screen.findByText('Part Wallet'))

        expect(await screen.findByText('400')).toBeOnTheScreen()
        expect(screen.queryByText('2,000')).toBeNull()
    })

    it('should restore the full ask when a wallet that covers it is chosen', async () => {
        // only 400 could move from Part Wallet. Moving back to a wallet that
        // covers the gap has to raise the ask again, or the user sends 400 from
        // a wallet holding 9,000 and is still short
        renderSheet([
            makeFederation('part', 'Part Wallet', 500_000),
            makeFederation('rich', 'Rich Wallet', 9_000_000),
        ])

        await user.press(screen.getByTestId('topup-source'))
        await user.press(await screen.findByText('Part Wallet'))
        expect(await screen.findByText('400')).toBeOnTheScreen()

        await user.press(screen.getByTestId('topup-source'))
        await user.press(await screen.findByText('Rich Wallet'))

        expect(await screen.findByText('2,000')).toBeOnTheScreen()
        expect(screen.queryByText('400')).toBeNull()
    })

    it('should restore the full ask for an external deposit', async () => {
        // an outside deposit has no sendable cap, so a lowered ask would write
        // a lightning invoice short of the gap
        renderSheet([makeFederation('part', 'Part Wallet', 500_000)])

        expect(await screen.findByText('400')).toBeOnTheScreen()

        await user.press(screen.getByTestId('topup-source'))
        await user.press(await screen.findByTestId('topup-source-external'))

        expect(await screen.findByText('2,000')).toBeOnTheScreen()
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
     * back on the first transfer's "Funds moved".
     */
    it('should start over when it is reopened after a settled top-up', async () => {
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
            payInvoice: Promise.resolve({}),
            listTransactions: Promise.resolve([
                { Ok: makeClaimedDeposit('lnbc-top-up') },
            ]),
        })
        const { rerender } = renderWithProviders(
            <TopUpSheet show {...props} />,
            {
                preloadedState: makePreloadedState([
                    makeFederation('rich', 'Rich Wallet', 9_000_000),
                ]),
                fedimint,
            },
        )

        await user.press(screen.getByText(i18n.t('words.send')))
        await screen.findByText(i18n.t('feature.wallet-service.topup-moved'))
        await user.press(screen.getByText(i18n.t('words.continue')))
        await waitFor(() => {
            expect(props.onFunded).toHaveBeenCalledTimes(1)
        })

        rerender(<TopUpSheet show={false} {...props} />)
        rerender(<TopUpSheet show {...props} />)

        expect(
            screen.getByText(i18n.t('feature.wallet-service.topup-title')),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.wallet-service.topup-moved')),
        ).toBeNull()
    })

    /**
     * #12202: each reopen wrote a new invoice over one that was already paid
     * and waiting on guardians, so a founder could pay twice.
     */
    describe('one invoice per top-up', () => {
        const props = {
            onDismiss: jest.fn(),
            onFunded: jest.fn(),
            totalMsats: TOTAL_MSATS,
            availableMsats: AVAILABLE_MSATS,
            payerFederationId: payerFederation.id,
            payerFederationName: payerFederation.name,
        }

        it('should reopen on the unpaid invoice rather than write a new one', async () => {
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                listTransactions: Promise.resolve([
                    {
                        Ok: makeClaimedDeposit('lnbc-top-up', {
                            type: 'waitingForPayment',
                        }),
                    },
                ]),
            })
            const { rerender, store } = renderWithProviders(
                <TopUpSheet show {...props} />,
                { preloadedState: makePreloadedState([]), fedimint },
            )
            await openInvoiceView(user)

            rerender(<TopUpSheet show={false} {...props} />)
            rerender(<TopUpSheet show {...props} />)

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-waiting'),
                ),
            ).toBeOnTheScreen()
            expect(fedimint.generateInvoice).toHaveBeenCalledTimes(1)
            expect(store.getState().fi.topUpInvoice).toEqual({
                bolt11: 'lnbc-top-up',
                payerFederationId: payerFederation.id,
                amountMsats: 2_000_000,
                sourceFederationId: null,
                createdAt: expect.any(Number),
            })
        })

        it('should settle a reopened invoice that was paid while the sheet was closed', async () => {
            const onFunded = jest.fn()
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                listTransactions: Promise.resolve([
                    { Ok: makeClaimedDeposit('lnbc-held') },
                ]),
            })
            const store = setupStore(makePreloadedState([]))
            store.dispatch(
                setWalletServiceTopUpInvoice({
                    bolt11: 'lnbc-held',
                    payerFederationId: payerFederation.id,
                    amountMsats: 2_000_000 as MSats,
                    sourceFederationId: null,
                    createdAt: Date.now(),
                }),
            )
            renderWithProviders(
                <TopUpSheet show {...props} onFunded={onFunded} />,
                { store, fedimint },
            )

            // checked on open, not after the first poll interval
            await waitFor(() => {
                expect(onFunded).toHaveBeenCalledTimes(1)
            })
            expect(fedimint.generateInvoice).not.toHaveBeenCalled()
            expect(store.getState().fi.topUpInvoice).toBeNull()
        })

        it('should ignore an invoice held for a different payer', async () => {
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
            })
            const store = setupStore(makePreloadedState([]))
            store.dispatch(
                setWalletServiceTopUpInvoice({
                    bolt11: 'lnbc-other-payer',
                    payerFederationId: 'other-payer',
                    amountMsats: 2_000_000 as MSats,
                    sourceFederationId: null,
                    createdAt: Date.now(),
                }),
            )
            renderWithProviders(<TopUpSheet show {...props} />, {
                store,
                fedimint,
            })

            expect(
                screen.getByText(i18n.t('feature.wallet-service.topup-title')),
            ).toBeOnTheScreen()
        })

        it('should allow a new invoice once the held one has expired', async () => {
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                listTransactions: Promise.resolve([
                    {
                        Ok: makeClaimedDeposit('lnbc-top-up', {
                            type: 'canceled',
                        }),
                    },
                ]),
            })
            const { store } = renderWithProviders(
                <TopUpSheet show {...props} />,
                { preloadedState: makePreloadedState([]), fedimint },
            )

            await user.press(screen.getByText(i18n.t('words.continue')))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-title'),
                ),
            ).toBeOnTheScreen()
            expect(store.getState().fi.topUpInvoice).toBeNull()
            expect(props.onFunded).not.toHaveBeenCalled()

            await user.press(screen.getByText(i18n.t('words.continue')))

            await waitFor(() => {
                expect(fedimint.generateInvoice).toHaveBeenCalledTimes(2)
            })
        })

        it('should stay open and say so when I have paid finds no payment', async () => {
            const onFunded = jest.fn()
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                listTransactions: Promise.resolve([
                    {
                        Ok: makeClaimedDeposit('lnbc-top-up', {
                            type: 'waitingForPayment',
                        }),
                    },
                ]),
            })
            renderSheet([], fedimint, onFunded)
            await openInvoiceView(user)

            await user.press(
                screen.getByText(
                    i18n.t('feature.wallet-service.topup-ive-paid'),
                ),
            )

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-not-received'),
                ),
            ).toBeOnTheScreen()
            expect(onFunded).not.toHaveBeenCalled()
        })

        it('should retry a failed send by paying the same invoice again', async () => {
            let payAttempts = 0
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                listTransactions: Promise.resolve([]),
                payInvoice: () => {
                    payAttempts += 1
                    return payAttempts === 1
                        ? Promise.reject(new Error('gateway timed out'))
                        : Promise.resolve({})
                },
            })
            renderSheet(
                [makeFederation('rich', 'Rich Wallet', 9_000_000)],
                fedimint,
            )

            await user.press(screen.getByText(i18n.t('words.send')))
            await user.press(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-send-again', {
                        federation: 'Rich Wallet',
                    }),
                ),
            )

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-moved'),
                ),
            ).toBeOnTheScreen()
            expect(fedimint.generateInvoice).toHaveBeenCalledTimes(1)
            expect(fedimint.payInvoice).toHaveBeenCalledTimes(2)
            expect(fedimint.payInvoice).toHaveBeenNthCalledWith(
                2,
                'lnbc-top-up',
                'rich',
            )
        })

        // a sent payment still waits on guardians to claim it; closing on
        // Continue dropped the invoice while the screen behind stayed short
        it('should keep the invoice when Continue finds the transfer unclaimed', async () => {
            const onFunded = jest.fn()
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                payInvoice: Promise.resolve({}),
                listTransactions: Promise.resolve([
                    {
                        Ok: makeClaimedDeposit('lnbc-top-up', {
                            type: 'funded',
                        }),
                    },
                ]),
            })
            const { store } = renderSheet(
                [makeFederation('rich', 'Rich Wallet', 9_000_000)],
                fedimint,
                onFunded,
            )

            await user.press(screen.getByText(i18n.t('words.send')))
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-moved'),
            )
            await user.press(screen.getByText(i18n.t('words.continue')))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-not-received'),
                ),
            ).toBeOnTheScreen()
            expect(onFunded).not.toHaveBeenCalled()
            expect(store.getState().fi.topUpInvoice?.bolt11).toBe('lnbc-top-up')
        })

        // the lookback is 50 transactions, so a busy wallet can push an
        // expired invoice out of view, where it read as "still waiting"
        it('should expire a held invoice that is missing and past its expiry', async () => {
            const fedimint = createMockFedimintBridge({
                listTransactions: Promise.resolve([]),
            })
            const store = setupStore(makePreloadedState([]))
            store.dispatch(
                setWalletServiceTopUpInvoice({
                    bolt11: 'lnbc-old',
                    payerFederationId: payerFederation.id,
                    amountMsats: 2_000_000 as MSats,
                    sourceFederationId: null,
                    createdAt: Date.now() - 25 * 60 * 60 * 1000,
                }),
            )
            renderWithProviders(<TopUpSheet show {...props} />, {
                store,
                fedimint,
            })

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-title'),
                ),
            ).toBeOnTheScreen()
            expect(store.getState().fi.topUpInvoice).toBeNull()
        })

        it('should keep waiting on a missing invoice that has not expired', async () => {
            const fedimint = createMockFedimintBridge({
                listTransactions: Promise.resolve([]),
            })
            const store = setupStore(makePreloadedState([]))
            store.dispatch(
                setWalletServiceTopUpInvoice({
                    bolt11: 'lnbc-recent',
                    payerFederationId: payerFederation.id,
                    amountMsats: 2_000_000 as MSats,
                    sourceFederationId: null,
                    createdAt: Date.now() - 23 * 60 * 60 * 1000,
                }),
            )
            renderWithProviders(<TopUpSheet show {...props} />, {
                store,
                fedimint,
            })

            await waitFor(() => {
                expect(fedimint.listTransactions).toHaveBeenCalled()
            })
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.topup-waiting'),
                ),
            ).toBeOnTheScreen()
            expect(store.getState().fi.topUpInvoice?.bolt11).toBe('lnbc-recent')
        })

        it('should count an already paid invoice as a finished send', async () => {
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
                payInvoice: () =>
                    Promise.reject(
                        new BridgeError({
                            error: 'already paid',
                            errorCode: 'payLnInvoiceAlreadyPaid',
                            detail: '',
                        }),
                    ),
            })
            renderSheet(
                [makeFederation('rich', 'Rich Wallet', 9_000_000)],
                fedimint,
            )

            await user.press(screen.getByText(i18n.t('words.send')))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-moved'),
                ),
            ).toBeOnTheScreen()
            expect(mockToast.error).not.toHaveBeenCalled()
        })
    })

    describe('an amount short of the gap', () => {
        it('should allow a smaller amount and name what it leaves short', async () => {
            // 400 can move from Part Wallet against a 1,234 sat gap
            renderSheet([makeFederation('part', 'Part Wallet', 500_000)])

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.topup-leaves-short', {
                        amount: '834 SATS',
                    }),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByText(i18n.t('words.send'))).toBeOnTheScreen()
        })

        it('should say nothing when the amount covers the gap', () => {
            renderSheet([makeFederation('rich', 'Rich Wallet', 9_000_000)])

            expect(screen.queryByText(/short of the setup cost/)).toBeNull()
        })

        it('should not write an invoice for zero', async () => {
            const fedimint = createMockFedimintBridge({
                generateInvoice: Promise.resolve('lnbc-top-up'),
            })
            renderSheet([], fedimint)

            for (let i = 0; i < 4; i += 1)
                await user.press(screen.getByTestId('NumpadButton-backspace'))
            await user.press(screen.getByText(i18n.t('words.continue')))

            expect(fedimint.generateInvoice).not.toHaveBeenCalled()
        })
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
            [makeFederation('rich', 'Rich Wallet', 9_000_000)],
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

    it('should write the invoice for what a part funded wallet can send', async () => {
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
            payInvoice: Promise.resolve({}),
        })
        // 500 sats held, 100 reserved for routing, so 400 moves against a
        // 2,000 sat ask
        renderSheet([makeFederation('part', 'Part Wallet', 500_000)], fedimint)

        await user.press(screen.getByText(i18n.t('words.send')))

        await waitFor(() => {
            expect(fedimint.generateInvoice).toHaveBeenCalledWith(
                400_000,
                i18n.t('phrases.wallet-service'),
                payerFederation.id,
                null,
            )
        })
        expect(fedimint.payInvoice).toHaveBeenCalledWith('lnbc-top-up', 'part')
    })

    it('should name the invoice, not the ask, once the funds have moved', async () => {
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
            payInvoice: Promise.resolve({}),
        })
        // 500 sats held, so 400 can move. Typing a trailing zero raises the ask
        // to 4,000, which the invoice caps and the success line must not repeat
        renderSheet([makeFederation('part', 'Part Wallet', 500_000)], fedimint)
        await user.press(screen.getByTestId('NumpadButton-0'))

        await user.press(screen.getByText(i18n.t('words.send')))

        await waitFor(() => {
            expect(fedimint.generateInvoice).toHaveBeenCalledWith(
                400_000,
                i18n.t('phrases.wallet-service'),
                payerFederation.id,
                null,
            )
        })
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.topup-moved-detail', {
                    amount: '400',
                    federation: payerFederation.name,
                }),
            ),
        ).toBeOnTheScreen()
    })

    it('should hand back to the confirm screen without paying for setup', async () => {
        const onFunded = jest.fn()
        const fedimint = createMockFedimintBridge({
            generateInvoice: Promise.resolve('lnbc-top-up'),
            payInvoice: Promise.resolve({}),
            fiClientPayAndCreate: Promise.resolve({ type: 'success' }),
            listTransactions: Promise.resolve([
                { Ok: makeClaimedDeposit('lnbc-top-up') },
            ]),
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

        await waitFor(() => {
            expect(onFunded).toHaveBeenCalledTimes(1)
        })
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
                50,
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
                listTransactions: Promise.resolve([]),
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
