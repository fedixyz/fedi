import {
    act,
    cleanup,
    fireEvent,
    screen,
    userEvent,
    waitFor,
    within,
} from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { FederationStatus, MSats } from '@fedi/common/types'
import type {
    FeatureCatalog,
    RpcFaFormedFederation,
    RpcFaFormedSeat,
    RpcFaGuardianTransfer,
    RpcFaGuardianTransferResult,
    RpcFaOperationError,
    RpcFaReplacementCheck,
    RpcFaTransferDestinationPreview,
} from '@fedi/common/types/bindings'

import i18n from '../../../localization/i18n'
import WalletServiceGuardianTransfer from '../../../screens/WalletServiceGuardianTransfer'
import { mockNavigation, mockToast } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

/**
 * The sheet is the top-up flow's own screen with its own tests; this screen's
 * contract is when it opens and what a funded top-up does next.
 */
const mockTopUpSheet = jest.fn()
jest.mock(
    '../../../components/feature/walletservice/TopUpSheet',
    () => (props: { show: boolean; onFunded: () => void }) => {
        mockTopUpSheet(props)
        return null
    },
)

const lastTopUpProps = () =>
    mockTopUpSheet.mock.calls[mockTopUpSheet.mock.calls.length - 1][0]

const makeSeat = (index: number, mgName: string): RpcFaFormedSeat => ({
    mgId: `mg-${index}`,
    mgName,
    seatId: `seat-${index}`,
    locator: `locator-${index}`,
})

const makeFederation = (): RpcFaFormedFederation => ({
    formationId: 'formation-1',
    federationInvite: 'fed11invite',
    federationName: 'My Wallet Service',
    seats: [
        makeSeat(0, 'amber oak'),
        makeSeat(1, 'brisk elm'),
        makeSeat(2, 'calm fir'),
    ],
    freshness: 'fresh',
    backupEligible: true,
    origin: 'thisDevice',
})

const PRICE_MSATS = '21000000'
const WALLET_SERVICE_FEDERATION_ID = 'wallet-service-federation'

const preview: RpcFaTransferDestinationPreview = {
    previewId: 'transfer-preview-1',
    mgId: 'mg-new',
    mgName: 'deep pine',
    advertisedPriceMsats: PRICE_MSATS,
    provenance: 'registry',
    validUntil: 4_000_000_000,
}

const secondPreview: RpcFaTransferDestinationPreview = {
    ...preview,
    previewId: 'transfer-preview-2',
    mgId: 'mg-other',
    mgName: 'wide bay',
    advertisedPriceMsats: '23500000',
}

const makeTransfer = (
    overrides: Partial<RpcFaGuardianTransfer> = {},
): RpcFaGuardianTransfer => ({
    seatIndex: 1,
    sourceMgId: 'mg-1',
    sourceMgName: 'brisk elm',
    sourceSeatId: 'seat-1',
    destinationMgId: 'mg-new',
    destinationMgName: 'deep pine',
    destinationSeatId: 'seat-new',
    phase: 'awaitingSource',
    ...overrides,
})

const noTransfer = { type: 'transfer', transfer: null } as const

/** Sends an item on the open guardian move stream, as the bridge does. */
let emitTransfer: (result: RpcFaGuardianTransferResult) => void = () => {
    throw new Error('no guardian move stream open')
}

/** The bridge moving on: the next move, or none, on the stream. */
const streamTransfer = (transfer: RpcFaGuardianTransfer | null) =>
    act(() => emitTransfer({ type: 'transfer', transfer }))

/**
 * A start as the bridge runs it: each move it reaches arrives on the stream
 * before the start answers with the last one.
 */
const streamedStart =
    (...moves: RpcFaGuardianTransfer[]) =>
    async () => {
        for (const move of moves)
            emitTransfer({ type: 'transfer', transfer: move })
        return { type: 'transfer' as const, transfer: moves[moves.length - 1] }
    }
const previewResult = (value = preview) => ({
    type: 'preview' as const,
    preview: value,
})
const failure = (error: RpcFaOperationError) => ({
    type: 'error' as const,
    error,
})
const noFreeHost = failure({
    code: 'selection',
    message: 'no free host',
    detail: {
        type: 'insufficientMgSeats',
        requested: 1,
        selected: 0,
        seen: 3,
        eligible: 0,
    },
})

// the same ids and names as `makeSeat`
const flaggedSeat = (seat: RpcFaFormedSeat, seatIndex: number) => ({
    seatIndex,
    mgId: seat.mgId,
    mgName: seat.mgName,
    reasons: [{ type: 'offline' as const, lastSeenSecs: 1_700_000_000 }],
})

/** The latest replacement check; by default it flagged every seat. */
const flaggedCheck = (
    candidates: RpcFaReplacementCheck['candidates'] = makeFederation().seats.map(
        flaggedSeat,
    ),
): RpcFaReplacementCheck => ({
    federationId: mockFederation1.id,
    checkedAt: 1_700_003_600,
    blockingLiquidityOperation: null,
    candidates,
})

const renderScreen = ({
    methods,
    balanceMsats = 50_000_000,
    seatIndex,
    isEnabled = true,
    replacementCheck = flaggedCheck(),
    transfer = null,
    walletServiceStatus,
}: {
    methods?: Parameters<typeof createMockFedimintBridge>[0]
    balanceMsats?: number
    /** The guardian picked before the screen opened. */
    seatIndex?: number
    isEnabled?: boolean
    /** What the candidates stream answers; `null` is no check run yet. */
    replacementCheck?: RpcFaReplacementCheck | null
    /** What the guardian move stream sends first; `null` is no move open. */
    transfer?: RpcFaGuardianTransfer | null
    /** The wallet service federation's status; not joined when unset. */
    walletServiceStatus?: FederationStatus
}) => {
    const fedimint = createMockFedimintBridge({
        parseInviteCode: async () => ({
            federationId: WALLET_SERVICE_FEDERATION_ID,
        }),
        faClientEligiblePayers: Promise.resolve({
            type: 'payers',
            payers: [{ federationId: mockFederation1.id, balanceMsats: '0' }],
        }),
        faClientSubscribeReplacementCandidates: (args: {
            callback: (candidates: {
                type: 'ready'
                check: RpcFaReplacementCheck | null
            }) => void
        }) => {
            args.callback({ type: 'ready', check: replacementCheck })
            return () => {}
        },
        faClientSubscribeGuardianTransfer: (args: {
            callback: (result: RpcFaGuardianTransferResult) => void
        }) => {
            emitTransfer = args.callback
            args.callback({ type: 'transfer', transfer })
            return () => {}
        },
        ...methods,
    })
    const state = setupStore().getState()
    renderWithProviders(
        <WalletServiceGuardianTransfer
            navigation={mockNavigation as never}
            route={
                {
                    params: seatIndex === undefined ? undefined : { seatIndex },
                } as never
            }
        />,
        {
            fedimint,
            preloadedState: {
                environment: {
                    ...state.environment,
                    transactionDisplayType: 'sats' as const,
                    onboardingCompleted: true,
                    featureFlags: (isEnabled
                        ? { wallet_service_guardian_transfer: {} }
                        : {}) as FeatureCatalog,
                },
                federation: {
                    ...state.federation,
                    federations: [
                        {
                            ...mockFederation1,
                            balance: balanceMsats as MSats,
                        },
                        ...(walletServiceStatus
                            ? [
                                  {
                                      ...mockFederation1,
                                      id: WALLET_SERVICE_FEDERATION_ID,
                                      status: walletServiceStatus,
                                  },
                              ]
                            : []),
                    ],
                    payFromFederationId: mockFederation1.id,
                },
                fi: {
                    ...state.fi,
                    status: { type: 'formed', federation: makeFederation() },
                },
            },
        },
    )
    return fedimint
}

describe('screens/WalletServiceGuardianTransfer', () => {
    let user: ReturnType<typeof userEvent.setup>

    beforeEach(() => {
        user = userEvent.setup()
    })

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    describe('with the feature flag off', () => {
        it('should leave and render nothing', async () => {
            const fedimint = renderScreen({
                isEnabled: false,
            })

            await waitFor(() =>
                expect(mockNavigation.goBack).toHaveBeenCalledTimes(1),
            )
            expect(screen.toJSON()).toBeNull()
            expect(
                fedimint.faClientSubscribeGuardianTransfer,
            ).not.toHaveBeenCalled()
        })
    })

    it('should pay for the chosen guardian at the price shown', async () => {
        const fedimint = renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
                faClientStartGuardianTransfer: streamedStart(
                    makeTransfer({ seatIndex: 2 }),
                ),
            },
        })

        // the third seat, so a screen that sent the first or a 1-based
        // position would fail
        await user.press(await screen.findByTestId('transfer-seat-2'))
        const destination = within(
            await screen.findByTestId('transfer-destination-row'),
        )
        expect(
            destination.getByText(
                i18n.t('feature.wallet-service.transfer-paid-to-value', {
                    name: 'deep pine',
                }),
            ),
        ).toBeOnTheScreen()
        expect(
            destination.getByText(
                i18n.t('feature.wallet-service.transfer-replaces'),
            ),
        ).toBeOnTheScreen()
        expect(destination.getByText('calm fir')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.transfer-confirm-title'),
            ),
        ).toBeOnTheScreen()

        expect(
            fedimint.faClientPreviewTransferDestination,
        ).toHaveBeenCalledWith(2)

        await user.press(screen.getByTestId('transfer-start-button'))

        await waitFor(() =>
            expect(fedimint.faClientStartGuardianTransfer).toHaveBeenCalledWith(
                'transfer-preview-1',
                mockFederation1.id,
                PRICE_MSATS,
            ),
        )
        expect(
            await screen.findByTestId('transfer-step-awaitingSource'),
        ).toBeOnTheScreen()
    })

    it('should show the payer, the price and the pay button for a priced seat', async () => {
        renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-0'))

        expect(await screen.findByTestId('transfer-cost')).toBeOnTheScreen()
        expect(screen.getByTestId('wallet-service-payer-row')).toBeOnTheScreen()
        expect(screen.getByTestId('quote-countdown')).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.wallet-service.transfer-start')),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n
                    .t('feature.wallet-service.transfer-one-time')
                    .toUpperCase(),
            ),
        ).toBeOnTheScreen()
        // the quote carries no fee, so the screen says one is added
        expect(screen.getByTestId('transfer-network-fee')).toBeOnTheScreen()
        expect(screen.queryByTestId('transfer-cost-free')).not.toBeOnTheScreen()
    })

    it('should say who is paid and which guardian it replaces, with no recipient count', async () => {
        renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))

        const row = within(
            await screen.findByTestId('transfer-destination-row'),
        )
        expect(
            row.getByText(i18n.t('feature.wallet-service.transfer-paid-to')),
        ).toBeOnTheScreen()
        expect(
            row.getByText(
                i18n.t('feature.wallet-service.transfer-paid-to-value', {
                    name: 'deep pine',
                }),
            ),
        ).toBeOnTheScreen()
        // the seat picked, not the first or the destination
        expect(row.getByText('brisk elm')).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.send.send-to')),
        ).not.toBeOnTheScreen()
    })

    it('should start a free seat with no payer row and no balance check', async () => {
        const fedimint = renderScreen({
            balanceMsats: 0,
            methods: {
                faClientPreviewTransferDestination: previewResult({
                    ...preview,
                    advertisedPriceMsats: '0',
                }),
                faClientStartGuardianTransfer: Promise.resolve({
                    type: 'transfer',
                    transfer: makeTransfer({ phase: 'buyingSeat' }),
                }),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-0'))

        expect(
            await screen.findByTestId('transfer-cost-free'),
        ).toBeOnTheScreen()
        expect(screen.queryByTestId('transfer-cost')).not.toBeOnTheScreen()
        expect(
            screen.queryByTestId('wallet-service-payer-row'),
        ).not.toBeOnTheScreen()
        expect(screen.queryByTestId('top-up-button')).not.toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.transfer-confirm-free-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.transfer-start-free'),
            ),
        ).toBeOnTheScreen()

        await user.press(screen.getByTestId('transfer-start-button'))

        // the bridge still needs a payer federation, even for a free seat
        await waitFor(() =>
            expect(fedimint.faClientStartGuardianTransfer).toHaveBeenCalledWith(
                'transfer-preview-1',
                mockFederation1.id,
                '0',
            ),
        )
    })

    describe('whether the Federation keeps working', () => {
        const keepsWorking = i18n.t(
            'feature.wallet-service.replacement-keeps-working',
        )
        const belowQuorum = i18n.t(
            'feature.wallet-service.replacement-below-quorum',
        )

        it.each([
            ['online', keepsWorking, belowQuorum],
            // at quorum with guardians missing, payments still go through
            ['unstable', keepsWorking, belowQuorum],
            ['offline', belowQuorum, keepsWorking],
        ] as const)(
            'should say what members can do on the list and the review while %s',
            async (status, shown, hidden) => {
                renderScreen({
                    walletServiceStatus: status,
                    methods: {
                        faClientPreviewTransferDestination: previewResult(),
                    },
                })

                expect(
                    await screen.findByText(new RegExp(shown)),
                ).toBeOnTheScreen()
                expect(
                    screen.queryByText(new RegExp(hidden)),
                ).not.toBeOnTheScreen()

                await user.press(screen.getByTestId('transfer-seat-0'))
                await screen.findByTestId('transfer-start-button')

                expect(screen.getByText(new RegExp(shown))).toBeOnTheScreen()
                expect(
                    screen.queryByText(new RegExp(hidden)),
                ).not.toBeOnTheScreen()
            },
        )

        it('should claim neither before the status is known', async () => {
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                },
            })
            await user.press(await screen.findByTestId('transfer-seat-0'))
            await screen.findByTestId('transfer-start-button')

            expect(
                screen.queryByText(new RegExp(keepsWorking)),
            ).not.toBeOnTheScreen()
            expect(
                screen.queryByText(new RegExp(belowQuorum)),
            ).not.toBeOnTheScreen()
        })
    })

    describe('a wallet that cannot cover the price', () => {
        const renderShort = () =>
            renderScreen({
                balanceMsats: 20_999_999,
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                    faClientStartGuardianTransfer: noTransfer,
                },
            })

        it('should explain the shortfall and offer a top-up instead of paying', async () => {
            const fedimint = renderShort()

            await user.press(await screen.findByTestId('transfer-seat-0'))

            expect(
                await screen.findByText(
                    i18n.t(
                        'feature.wallet-service.transfer-insufficient-title',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('transfer-start-button'),
            ).not.toBeOnTheScreen()
            expect(lastTopUpProps().show).toBe(false)

            await user.press(screen.getByTestId('top-up-button'))

            expect(lastTopUpProps()).toMatchObject({
                show: true,
                totalMsats: PRICE_MSATS,
                availableMsats: '20999999',
                payerFederationId: mockFederation1.id,
            })
            expect(
                fedimint.faClientStartGuardianTransfer,
            ).not.toHaveBeenCalled()
        })

        it('should close the sheet and fetch a fresh price once funded', async () => {
            const fedimint = renderShort()
            await user.press(await screen.findByTestId('transfer-seat-0'))
            await user.press(await screen.findByTestId('top-up-button'))

            await act(async () => lastTopUpProps().onFunded())

            expect(lastTopUpProps().show).toBe(false)
            await waitFor(() =>
                expect(
                    fedimint.faClientPreviewTransferDestination,
                ).toHaveBeenCalledTimes(2),
            )
        })
    })

    describe('an open move', () => {
        it('should name the guardian being replaced and say the user can leave', async () => {
            renderScreen({
                transfer: makeTransfer(),
            })

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.transfer-progress-title', {
                        name: 'brisk elm',
                    }),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.transfer-moving'),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(
                    'The new guardian, deep pine, takes over as soon as brisk elm is online. Your payment is kept however long this takes.',
                ),
            ).toBeOnTheScreen()
            expect(
                within(
                    screen.getByTestId('transfer-step-awaitingSource-detail'),
                ).getByText('Waits for brisk elm to come online.'),
            ).toBeOnTheScreen()
            // only one move at a time, so the list is not offered
            expect(
                screen.queryByTestId('transfer-seat-0'),
            ).not.toBeOnTheScreen()
        })

        it('should say in the past tense what each finished step did', async () => {
            renderScreen({
                transfer: makeTransfer({ phase: 'publishingBinding' }),
            })
            const names = { source: 'brisk elm', destination: 'deep pine' }
            const detailOf = async (step: string) =>
                within(
                    await screen.findByTestId(`transfer-step-${step}-detail`),
                )

            expect(
                (await detailOf('buyingSeat')).getByText(
                    i18n.t(
                        'feature.wallet-service.transfer-step-buying-seat-done',
                        names,
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                (await detailOf('awaitingSource')).getByText(
                    i18n.t(
                        'feature.wallet-service.transfer-step-awaiting-source-done',
                        names,
                    ),
                ),
            ).toBeOnTheScreen()
            // the running and later steps still say what they are doing
            expect(
                (await detailOf('publishingBinding')).getByText(
                    i18n.t(
                        'feature.wallet-service.transfer-step-publishing-binding-detail',
                        names,
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                (await detailOf('removingSource')).getByText(
                    i18n.t(
                        'feature.wallet-service.transfer-step-removing-source-detail',
                        names,
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t(
                        'feature.wallet-service.transfer-step-buying-seat-detail',
                        names,
                    ),
                ),
            ).not.toBeOnTheScreen()
        })

        it('should go to the dashboard from Return to home', async () => {
            renderScreen({
                transfer: makeTransfer(),
            })

            // the loading state has its own Return to home
            await screen.findByTestId('transfer-step-awaitingSource')
            await user.press(screen.getByTestId('return-home-button'))

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceDashboard',
            )
        })
    })

    describe('picking a guardian', () => {
        it('should list only the guardians the latest check flagged, with why', async () => {
            const federation = makeFederation()
            renderScreen({
                replacementCheck: flaggedCheck([
                    {
                        ...flaggedSeat(federation.seats[2], 2),
                        reasons: [
                            { type: 'lowMonthScore', basisPoints: 8_149 },
                        ],
                    },
                ]),
            })

            const row = await screen.findByTestId('transfer-seat-2')
            expect(within(row).getByText('calm fir')).toBeOnTheScreen()
            expect(within(row).getByText(/81%/)).toBeOnTheScreen()
            expect(
                screen.queryByTestId('transfer-seat-0'),
            ).not.toBeOnTheScreen()
            expect(
                screen.queryByTestId('transfer-seat-1'),
            ).not.toBeOnTheScreen()
        })

        it('should not offer a flagged guardian whose seat another guardian holds now', async () => {
            renderScreen({
                // seat 1 was flagged for an MG that has since been replaced
                replacementCheck: flaggedCheck([
                    {
                        seatIndex: 1,
                        mgId: 'mg-replaced',
                        mgName: 'old ash',
                        reasons: [{ type: 'disconnected' }],
                    },
                ]),
            })

            expect(
                await screen.findByText(
                    i18n.t(
                        'feature.wallet-service.transfer-none-flagged-title',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('transfer-seat-1'),
            ).not.toBeOnTheScreen()
        })

        it('should say no guardian needs replacing after a check that flagged none', async () => {
            renderScreen({
                replacementCheck: flaggedCheck([]),
            })

            expect(
                await screen.findByText(
                    i18n.t(
                        'feature.wallet-service.transfer-none-flagged-title',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(screen.queryByTestId(/transfer-seat-/)).not.toBeOnTheScreen()
        })

        it('should say the guardians have not been checked before the first check', async () => {
            renderScreen({
                replacementCheck: null,
            })

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.transfer-not-checked-body'),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t(
                        'feature.wallet-service.transfer-none-flagged-title',
                    ),
                ),
            ).not.toBeOnTheScreen()
        })

        it('should explain when the guardian recovered before the quote', async () => {
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: failure({
                        code: 'replacementNotEligible',
                        message: 'not a candidate',
                        detail: null,
                    }),
                },
            })

            await user.press(await screen.findByTestId('transfer-seat-1'))

            // said on the list it went back to, by the name of the seat
            // picked, rather than in a toast that is gone before it is read
            expect(
                await screen.findByText(
                    i18n.t(
                        'feature.wallet-service.transfer-not-eligible-banner',
                        { name: 'brisk elm' },
                    ),
                ),
            ).toBeOnTheScreen()
            expect(mockToast.show).not.toHaveBeenCalled()
            // back on the list, with nothing to pay
            expect(
                await screen.findByTestId('transfer-seat-1'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('transfer-start-button'),
            ).not.toBeOnTheScreen()
        })
    })

    describe('the streamed move', () => {
        const doneTitle = i18n.t('feature.wallet-service.transfer-done-title', {
            source: 'brisk elm',
        })
        const stepDetail = (step: string) =>
            within(screen.getByTestId(`transfer-step-${step}-detail`))
        const names = { source: 'brisk elm', destination: 'deep pine' }

        it('should follow each phase the stream sends from one subscribe', async () => {
            const fedimint = renderScreen({ transfer: makeTransfer() })
            await screen.findByTestId('transfer-step-awaitingSource')
            expect(
                stepDetail('awaitingSource').getByText(
                    'Waits for brisk elm to come online.',
                ),
            ).toBeOnTheScreen()

            await streamTransfer(makeTransfer({ phase: 'publishingBinding' }))

            expect(
                stepDetail('awaitingSource').getByText(
                    i18n.t(
                        'feature.wallet-service.transfer-step-awaiting-source-done',
                        names,
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                fedimint.faClientSubscribeGuardianTransfer,
            ).toHaveBeenCalledTimes(1)
        })

        it('should keep the move up when the stream sends an error', async () => {
            renderScreen({ transfer: makeTransfer() })
            await screen.findByTestId('transfer-step-awaitingSource')

            act(() =>
                emitTransfer({
                    type: 'error',
                    error: { code: 'storage', message: 'nope', detail: null },
                }),
            )

            expect(
                screen.getByTestId('transfer-step-awaitingSource'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('transfer-seat-0'),
            ).not.toBeOnTheScreen()
        })

        it('should show the done state, not a toast, when a watched move completes, and leave from Done', async () => {
            renderScreen({
                transfer: makeTransfer({ phase: 'removingSource' }),
            })
            await screen.findByTestId('transfer-step-removingSource')
            expect(
                screen.queryByTestId('transfer-finished-button'),
            ).not.toBeOnTheScreen()
            expect(screen.getByTestId('return-home-button')).toBeOnTheScreen()

            await streamTransfer(makeTransfer({ phase: 'completed' }))

            expect(screen.getByText(doneTitle)).toBeOnTheScreen()
            expect(
                within(screen.getByTestId('transfer-done-body')).getByText(
                    i18n.t('feature.wallet-service.transfer-done-body', {
                        destination: 'deep pine',
                    }),
                ),
            ).toBeOnTheScreen()
            // every step done, the last one included
            expect(
                stepDetail('removingSource').getByText(
                    i18n.t(
                        'feature.wallet-service.transfer-step-removing-source-done',
                        names,
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('return-home-button'),
            ).not.toBeOnTheScreen()
            expect(mockToast.show).not.toHaveBeenCalled()
            expect(mockNavigation.navigate).not.toHaveBeenCalled()

            fireEvent.press(screen.getByTestId('transfer-finished-button'))
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceDashboard',
            )
        })

        it.each(['buyingSeat', 'removingSource'] as const)(
            'should not show the done state when a watched move at %s turns into no move',
            async phase => {
                // the bridge reports `completed` itself; a purchase that ends
                // without a seat leaves no move, and that did not complete
                renderScreen({ transfer: makeTransfer({ phase }) })
                await screen.findByTestId(`transfer-step-${phase}`)

                await streamTransfer(null)

                expect(
                    await screen.findByTestId('transfer-seat-0'),
                ).toBeOnTheScreen()
                expect(screen.queryByText(doneTitle)).not.toBeOnTheScreen()
                expect(
                    screen.queryByTestId('transfer-finished-button'),
                ).not.toBeOnTheScreen()
            },
        )

        it('should show the done state for a move this screen started that completes before the start answers', async () => {
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                    faClientStartGuardianTransfer: streamedStart(
                        makeTransfer({ phase: 'buyingSeat' }),
                        makeTransfer({ phase: 'completed' }),
                    ),
                },
            })

            await user.press(await screen.findByTestId('transfer-seat-1'))
            await user.press(await screen.findByTestId('transfer-start-button'))

            expect(await screen.findByText(doneTitle)).toBeOnTheScreen()
            expect(
                screen.getByTestId('transfer-finished-button'),
            ).toBeOnTheScreen()
        })

        it('should offer a new move, with no toast, when the last one completed before the screen opened', async () => {
            renderScreen({ transfer: makeTransfer({ phase: 'completed' }) })

            expect(
                await screen.findByTestId('transfer-seat-0'),
            ).toBeOnTheScreen()
            expect(screen.queryByText(doneTitle)).not.toBeOnTheScreen()
            expect(mockToast.show).not.toHaveBeenCalled()
            expect(mockNavigation.navigate).not.toHaveBeenCalled()
        })
    })

    describe('an expiring quote', () => {
        beforeEach(() => jest.useFakeTimers())
        afterEach(() => jest.useRealTimers())

        const flush = (ms: number) =>
            act(async () => {
                await jest.advanceTimersByTimeAsync(ms)
            })

        it('should refresh an expired quote by itself and lock paying until it lands', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            let answerRefresh: (value: unknown) => void = () => {}
            const fedimint = renderScreen({
                seatIndex: 0,
                methods: {
                    faClientPreviewTransferDestination: jest
                        .fn()
                        .mockResolvedValueOnce(
                            previewResult({
                                ...preview,
                                validUntil: nowSecs + 2,
                            }),
                        )
                        .mockImplementation(
                            () =>
                                new Promise(resolve => {
                                    answerRefresh = resolve
                                }),
                        ),
                },
            })
            await flush(0)
            expect(screen.getByTestId('quote-countdown')).toBeOnTheScreen()

            await flush(2_000)

            expect(
                fedimint.faClientPreviewTransferDestination,
            ).toHaveBeenCalledTimes(2)
            expect(screen.getByTestId('quote-refreshing')).toBeOnTheScreen()
            expect(screen.getByTestId('transfer-start-button')).toBeDisabled()

            await act(async () =>
                answerRefresh(
                    previewResult({ ...preview, validUntil: nowSecs + 600 }),
                ),
            )

            expect(screen.getByTestId('quote-countdown')).toBeOnTheScreen()
            expect(screen.getByTestId('transfer-start-button')).toBeEnabled()
            // same host, same price: nothing for the user to re-check
            expect(
                screen.queryByText(
                    i18n.t(
                        'feature.wallet-service.transfer-quote-changed-title',
                    ),
                ),
            ).not.toBeOnTheScreen()
        })

        it('should refresh an expired quote only once when the refresh is expired too', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            const fedimint = renderScreen({
                seatIndex: 0,
                methods: {
                    faClientPreviewTransferDestination: jest
                        .fn()
                        .mockResolvedValueOnce(
                            previewResult({
                                ...preview,
                                validUntil: nowSecs + 2,
                            }),
                        )
                        .mockResolvedValue(
                            previewResult({
                                ...preview,
                                validUntil: nowSecs - 1,
                            }),
                        ),
                },
            })
            await flush(0)
            await flush(2_000)
            await flush(10_000)

            expect(
                fedimint.faClientPreviewTransferDestination,
            ).toHaveBeenCalledTimes(2)
            expect(screen.getByTestId('transfer-start-button')).toBeDisabled()
        })

        it('should say so when the refreshed quote is from another host', async () => {
            const nowSecs = Math.floor(Date.now() / 1000)
            renderScreen({
                seatIndex: 0,
                methods: {
                    faClientPreviewTransferDestination: jest
                        .fn()
                        .mockResolvedValueOnce(
                            previewResult({
                                ...preview,
                                validUntil: nowSecs + 2,
                            }),
                        )
                        .mockResolvedValue(previewResult(secondPreview)),
                },
            })
            await flush(0)
            await flush(2_000)

            expect(
                screen.getByText(
                    i18n.t(
                        'feature.wallet-service.transfer-quote-changed-title',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(
                within(
                    screen.getByTestId('transfer-destination-row'),
                ).getByText(
                    i18n.t('feature.wallet-service.transfer-paid-to-value', {
                        name: 'wide bay',
                    }),
                ),
            ).toBeOnTheScreen()
        })
    })

    it('should say on the list that replacement is not available yet when the policy refuses the start', async () => {
        const fedimint = renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
                faClientStartGuardianTransfer: Promise.resolve(
                    failure({
                        code: 'capabilityUnavailable',
                        message:
                            'the setup-payment policy does not enable guardian transfer',
                        detail: null,
                    }),
                ),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))
        await user.press(await screen.findByTestId('transfer-start-button'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.transfer-unavailable-banner'),
            ),
        ).toBeOnTheScreen()
        // back on the list with nothing to pay, and no toast over it
        expect(screen.getByTestId('transfer-seat-1')).toBeOnTheScreen()
        expect(
            screen.queryByTestId('transfer-start-button'),
        ).not.toBeOnTheScreen()
        expect(mockToast.show).not.toHaveBeenCalled()
        expect(fedimint.faClientStartGuardianTransfer).toHaveBeenCalledTimes(1)
    })

    it('should keep the review after a busy start so it can be tapped again', async () => {
        const fedimint = renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
                faClientStartGuardianTransfer: Promise.resolve(
                    failure({ code: 'busy', message: 'busy', detail: null }),
                ),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))
        await user.press(await screen.findByTestId('transfer-start-button'))

        await waitFor(() =>
            expect(mockToast.show).toHaveBeenCalledWith({
                content: i18n.t('feature.wallet-service.transfer-error-busy'),
                status: 'error',
            }),
        )
        expect(screen.queryByTestId('transfer-seat-1')).not.toBeOnTheScreen()

        await user.press(screen.getByTestId('transfer-start-button'))

        await waitFor(() =>
            expect(
                fedimint.faClientStartGuardianTransfer,
            ).toHaveBeenCalledTimes(2),
        )
        expect(fedimint.faClientStartGuardianTransfer).toHaveBeenLastCalledWith(
            'transfer-preview-1',
            mockFederation1.id,
            PRICE_MSATS,
        )
        expect(
            fedimint.faClientPreviewTransferDestination,
        ).toHaveBeenCalledTimes(1)
    })

    describe('while a new host is searched for', () => {
        const renderSearching = () =>
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: new Promise(() => {}),
                },
            })

        it('should show the review title and say what the search does', async () => {
            renderSearching()

            await user.press(await screen.findByTestId('transfer-seat-1'))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.transfer-searching'),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.transfer-searching-body'),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.transfer-review-title'),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t('feature.wallet-service.transfer-title'),
                ),
            ).not.toBeOnTheScreen()
        })

        it('should go to the dashboard from Return to home', async () => {
            renderSearching()

            await user.press(await screen.findByTestId('transfer-seat-1'))
            await screen.findByText(
                i18n.t('feature.wallet-service.transfer-searching'),
            )
            await user.press(screen.getByTestId('return-home-button'))

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceDashboard',
            )
        })
    })

    describe('no free host', () => {
        it('should explain with a banner and retry the search', async () => {
            const fedimint = renderScreen({
                methods: {
                    faClientPreviewTransferDestination: jest
                        .fn()
                        .mockResolvedValueOnce(noFreeHost)
                        .mockResolvedValue(previewResult()),
                    faClientStartGuardianTransfer: noTransfer,
                },
            })

            await user.press(await screen.findByTestId('transfer-seat-1'))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.transfer-not-found', {
                        selected: 0,
                        requested: 1,
                    }),
                ),
            ).toBeOnTheScreen()
            expect(mockToast.show).not.toHaveBeenCalled()

            await user.press(screen.getByTestId('transfer-retry-button'))

            expect(
                await screen.findByTestId('transfer-start-button'),
            ).toBeOnTheScreen()
            expect(
                fedimint.faClientPreviewTransferDestination,
            ).toHaveBeenCalledTimes(2)
            expect(
                fedimint.faClientStartGuardianTransfer,
            ).not.toHaveBeenCalled()
        })

        it('should go to the dashboard from Return to home', async () => {
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: noFreeHost,
                },
            })

            await user.press(await screen.findByTestId('transfer-seat-1'))
            await screen.findByTestId('transfer-retry-button')
            await user.press(screen.getByTestId('return-home-button'))

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceDashboard',
            )
        })
    })

    it('should re-price and stay on the review when the host is gone at pay time', async () => {
        const fedimint = renderScreen({
            methods: {
                faClientPreviewTransferDestination: jest
                    .fn()
                    .mockResolvedValueOnce(previewResult())
                    .mockResolvedValue(previewResult(secondPreview)),
                faClientStartGuardianTransfer: Promise.resolve(
                    failure({
                        code: 'selectionReauthorizationRequired',
                        message: 'host gone',
                        detail: {
                            type: 'selectionReauthorizationRequired',
                            reason: 'selectedMgUnavailable',
                        },
                    }),
                ),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))
        await user.press(await screen.findByTestId('transfer-start-button'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.transfer-quote-changed-body', {
                    price: '23,500 SATS',
                }),
            ),
        ).toBeOnTheScreen()
        expect(
            within(screen.getByTestId('transfer-destination-row')).getByText(
                i18n.t('feature.wallet-service.transfer-paid-to-value', {
                    name: 'wide bay',
                }),
            ),
        ).toBeOnTheScreen()
        expect(
            fedimint.faClientPreviewTransferDestination,
        ).toHaveBeenCalledTimes(2)
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should keep the review with a banner when the payment fails', async () => {
        renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
                faClientStartGuardianTransfer: Promise.resolve(
                    failure({
                        code: 'payment',
                        message: 'payment failed',
                        detail: null,
                    }),
                ),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))
        await user.press(await screen.findByTestId('transfer-start-button'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.transfer-payment-failed-body'),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('transfer-start-button')).toBeOnTheScreen()
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should keep the review with the payment banner when the bridge says the payer is short', async () => {
        const fedimint = renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
                faClientStartGuardianTransfer: Promise.resolve(
                    failure({
                        code: 'selectionReauthorizationRequired',
                        message: 'payer short',
                        detail: {
                            type: 'selectionReauthorizationRequired',
                            reason: 'selectedPayerInsufficientFunds',
                        },
                    }),
                ),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))
        await user.press(await screen.findByTestId('transfer-start-button'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.transfer-payment-failed-body'),
            ),
        ).toBeOnTheScreen()
        // not a moved price: the reason is checked before the re-preview list
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.transfer-quote-changed-title'),
            ),
        ).not.toBeOnTheScreen()
        expect(
            fedimint.faClientPreviewTransferDestination,
        ).toHaveBeenCalledTimes(2)
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    describe('no wallet that can pay', () => {
        it('should say a Federation has to be joined when the bridge trusts none the user holds', async () => {
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                    faClientEligiblePayers: Promise.resolve({
                        type: 'payers',
                        payers: [],
                    }),
                },
            })

            await user.press(await screen.findByTestId('transfer-seat-1'))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.join-card-body'),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('transfer-start-button')).toBeDisabled()
        })

        it('should say the wallets could not be checked when the lookup fails', async () => {
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                    faClientEligiblePayers: Promise.resolve(
                        failure({
                            code: 'busy',
                            message: 'lookup failed',
                            detail: null,
                        }),
                    ),
                },
            })

            await user.press(await screen.findByTestId('transfer-seat-1'))

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.payer-lookup-failed-title'),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).not.toBeOnTheScreen()
        })

        it('should show no banner while the lookup is still out', async () => {
            renderScreen({
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                    faClientEligiblePayers: new Promise(() => {}),
                },
            })

            await user.press(await screen.findByTestId('transfer-seat-1'))
            await screen.findByTestId('transfer-cost')

            expect(
                screen.queryByText(
                    i18n.t('feature.wallet-service.join-card-title'),
                ),
            ).not.toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t('feature.wallet-service.payer-lookup-failed-title'),
                ),
            ).not.toBeOnTheScreen()
        })
    })

    it('should return to the guardian list with a toast on a failure it cannot explain', async () => {
        renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
                faClientStartGuardianTransfer: Promise.resolve(
                    failure({
                        code: 'invalidIntent',
                        message: 'nope',
                        detail: null,
                    }),
                ),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))
        await user.press(await screen.findByTestId('transfer-start-button'))

        await waitFor(() =>
            expect(mockToast.show).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'error' }),
            ),
        )
        expect(await screen.findByTestId('transfer-seat-1')).toBeOnTheScreen()
    })

    describe('a guardian picked before the screen opened', () => {
        it('should open on its review without the list', async () => {
            const fedimint = renderScreen({
                seatIndex: 2,
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                    faClientStartGuardianTransfer: noTransfer,
                },
            })

            expect(
                await screen.findByTestId('transfer-start-button'),
            ).toBeOnTheScreen()
            expect(screen.getByText('calm fir')).toBeOnTheScreen()
            expect(
                screen.queryByTestId('transfer-seat-0'),
            ).not.toBeOnTheScreen()
            expect(
                fedimint.faClientPreviewTransferDestination,
            ).toHaveBeenCalledTimes(1)
        })

        it('should leave the screen from the review back button', async () => {
            renderScreen({
                seatIndex: 2,
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                },
            })

            await screen.findByTestId('transfer-start-button')
            await user.press(screen.getByTestId('HeaderBackButton'))

            expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
            expect(
                screen.queryByTestId('transfer-seat-0'),
            ).not.toBeOnTheScreen()
        })

        it('should show the open move instead when one is already running', async () => {
            const fedimint = renderScreen({
                seatIndex: 2,
                transfer: makeTransfer(),
                methods: {
                    faClientPreviewTransferDestination: previewResult(),
                },
            })

            expect(
                await screen.findByTestId('transfer-step-awaitingSource'),
            ).toBeOnTheScreen()
            expect(
                fedimint.faClientPreviewTransferDestination,
            ).not.toHaveBeenCalled()
        })
    })

    it('should go back to the list from the review back button', async () => {
        renderScreen({
            methods: {
                faClientPreviewTransferDestination: previewResult(),
            },
        })

        await user.press(await screen.findByTestId('transfer-seat-1'))
        await screen.findByTestId('transfer-start-button')
        await user.press(screen.getByTestId('HeaderBackButton'))

        expect(await screen.findByTestId('transfer-seat-1')).toBeOnTheScreen()
        expect(mockNavigation.goBack).not.toHaveBeenCalled()
    })
})
