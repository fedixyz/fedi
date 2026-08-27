import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'

import {
    WALLET_SERVICE_SIZE_OPTIONS,
    setTransactionDisplayType,
    setupStore,
} from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    RpcFiSelectionPreview,
    RpcFiSelectionPreviewRequest,
    RpcFiSelectionPreviewResult,
} from '@fedi/common/types/bindings'

import { GUARDIAN_SEAT_SKELETON_ROWS } from '../../../components/feature/walletservice/GuardianSeatsSkeleton'
import i18n from '../../../localization/i18n'
import CreateWalletService from '../../../screens/CreateWalletService'
import {
    mockNavigation,
    mockRoute,
    mockScreenFocus,
    mockToast,
} from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const FIXED_NOW_MS = 1_700_000_000_000
const NOW_SECS = FIXED_NOW_MS / 1000
/** Debounce window in the screen, plus a tick to clear it. */
const PAST_DEBOUNCE_MS = 400

const makeSeat = (index: number, priceMsats: string) => ({
    fmanId: `fman_0${index}`,
    fmanName: '',
    advertisedPriceMsats: priceMsats,
    provenance: 'fedi_attested',
})

// three seats at 100/200/300 sats: deliberately not uniform, and small enough
// that no locale inserts a thousands separator into the assertions
const makePreview = (
    overrides: Partial<RpcFiSelectionPreview> = {},
): RpcFiSelectionPreview => ({
    previewId: 'preview_1',
    selected: 10,
    totalAdvertisedMsats: '600000',
    seen: 42,
    eligible: 30,
    validUntil: NOW_SECS + 120,
    seats: [
        makeSeat(1, '100000'),
        makeSeat(2, '200000'),
        makeSeat(3, '300000'),
    ],
    ...overrides,
})

const previewResult = (
    overrides: Partial<RpcFiSelectionPreview> = {},
): RpcFiSelectionPreviewResult => ({
    type: 'preview',
    preview: makePreview(overrides),
})

const insufficientSeatsResult = (
    requested: number,
    eligible: number,
): RpcFiSelectionPreviewResult => ({
    type: 'error',
    error: {
        code: 'selection',
        message: 'not enough verified fleet managers for this size',
        detail: {
            type: 'insufficientFmanSeats',
            requested,
            selected: eligible,
            seen: eligible + 3,
            eligible,
        },
    },
})

const makeBridge = (
    previewSelection: (request: RpcFiSelectionPreviewRequest) => unknown = () =>
        Promise.resolve(previewResult()),
) =>
    createMockFedimintBridge({
        fiClientPreviewSelection: previewSelection,
        fiClientEligiblePayers: { type: 'payers', payers: [] },
    })

const renderScreen = (fedimint: ReturnType<typeof makeBridge>) => {
    const store = setupStore()
    // amounts default to fiat, which the zero test rate collapses to one value
    // for every seat; sats keeps each advertised price distinguishable
    store.dispatch(setTransactionDisplayType('sats'))
    return renderWithProviders(
        <CreateWalletService
            navigation={mockNavigation as any}
            route={mockRoute as any}
        />,
        { fedimint, store },
    )
}

/** Let the debounce fire and the preview thunk settle. */
const settlePreview = async (ms = PAST_DEBOUNCE_MS) => {
    await act(async () => {
        jest.advanceTimersByTime(ms)
    })
}

describe('screens/CreateWalletService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers({ now: FIXED_NOW_MS })
    })

    afterEach(() => {
        cleanup()
        jest.useRealTimers()
    })

    it('should render every preset count and no custom entry', async () => {
        renderScreen(makeBridge())
        await settlePreview()

        expect(WALLET_SERVICE_SIZE_OPTIONS).toEqual([7, 10, 13, 16, 19])
        for (const option of [7, 10, 13, 16, 19]) {
            expect(screen.getByTestId(`${option}Tab`)).toBeOnTheScreen()
        }
        expect(
            screen.queryByText(i18n.t('feature.wallet-service.custom')),
        ).not.toBeOnTheScreen()
    })

    it('should badge only the recommended count of 10', async () => {
        renderScreen(makeBridge())
        await settlePreview()

        const badges = screen.getAllByText(
            i18n.t('feature.wallet-service.recommended'),
        )
        expect(badges).toHaveLength(1)
        expect(screen.getByTestId('guardian-count-headline')).toHaveTextContent(
            '10',
        )
    })

    it('should debounce a walk across counts into a single preview call', async () => {
        const fedimint = makeBridge()
        renderScreen(fedimint)
        await settlePreview()

        fireEvent.press(screen.getByTestId('13Tab'))
        fireEvent.press(screen.getByTestId('16Tab'))
        await settlePreview()

        expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(2)
        expect(fedimint.fiClientPreviewSelection).toHaveBeenLastCalledWith(
            expect.objectContaining({ federationSize: 16 }),
        )
    })

    it('should invalidate the previous quote and show the loader on return', async () => {
        const requested: number[] = []
        const fedimint = makeBridge(request => {
            requested.push(request.federationSize)
            // the refetch never lands, so the invalidated state is observable
            return requested.length === 1
                ? Promise.resolve(previewResult())
                : new Promise(() => undefined)
        })
        renderScreen(fedimint)
        await settlePreview()
        expect(screen.getByText('600 SATS')).toBeOnTheScreen()

        // leaving and returning re-focuses the screen with the old quote
        // still sitting in the store
        await act(async () => {
            mockScreenFocus.blur()
        })
        await act(async () => {
            mockScreenFocus.focus()
        })

        expect(screen.queryByText('600 SATS')).not.toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.finding-guardians'),
            ),
        ).toBeOnTheScreen()
    })

    it('should drop a response that lands after the user has backed out', async () => {
        let rejectPreview: (reason: unknown) => void = () => undefined
        const fedimint = makeBridge(
            () =>
                new Promise((_, reject) => {
                    rejectPreview = reject
                }),
        )
        const { unmount } = renderScreen(fedimint)
        await settlePreview()
        expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(1)

        unmount()
        await act(async () => {
            rejectPreview(new Error('network fell over'))
        })

        // the failure belongs to a screen the user already left
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should lock the count switcher while a search is in flight', async () => {
        const fedimint = makeBridge()
        renderScreen(fedimint)

        // the initial search has not settled yet, so the tap must not land
        fireEvent.press(screen.getByTestId('13Tab'))
        await settlePreview()

        expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(1)
        expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledWith(
            expect.objectContaining({ federationSize: 10 }),
        )
        expect(screen.getByTestId('guardian-count-headline')).toHaveTextContent(
            '10',
        )

        // once the quote has landed the switcher unlocks again
        fireEvent.press(screen.getByTestId('13Tab'))
        await settlePreview()

        expect(fedimint.fiClientPreviewSelection).toHaveBeenLastCalledWith(
            expect.objectContaining({ federationSize: 13 }),
        )
    })

    it('should clear the previous quote as soon as a new count is selected', async () => {
        const requested: number[] = []
        const fedimint = makeBridge(request => {
            requested.push(request.federationSize)
            // the second quote never lands, so the cleared state is observable
            return requested.length === 1
                ? Promise.resolve(previewResult())
                : new Promise(() => undefined)
        })
        renderScreen(fedimint)
        await settlePreview()

        expect(screen.getByText('600 SATS')).toBeOnTheScreen()

        fireEvent.press(screen.getByTestId('13Tab'))

        // the old total and seats vanish at once, before the new fetch starts
        expect(screen.queryByText('600 SATS')).not.toBeOnTheScreen()
        expect(
            screen.queryByTestId('guardian-details-toggle'),
        ).not.toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.finding-guardians'),
            ),
        ).toBeOnTheScreen()
    })

    /**
     * Selecting a count clears the quote at once but only arms the fetch, so
     * there is a whole debounce where there is no card and no search running.
     * The placeholder rows have to stand across it: gated on the search
     * instead, the slot was empty for that window while the cost card above was
     * already in its loading shape, and the two started 350ms apart.
     */
    it('should stand the placeholder rows from the tap, not from the fetch', async () => {
        const requested: number[] = []
        const fedimint = makeBridge(request => {
            requested.push(request.federationSize)
            return requested.length === 1
                ? Promise.resolve(previewResult())
                : new Promise(() => undefined)
        })
        renderScreen(fedimint)
        await settlePreview()

        expect(screen.getByTestId('guardian-details-toggle')).toBeOnTheScreen()

        fireEvent.press(screen.getByTestId('13Tab'))

        // card gone, search not started — the rows are already standing, in
        // step with the cost card's own placeholder
        expect(screen.getByTestId('guardian-details-slot')).toBeOnTheScreen()
        expect(screen.queryAllByTestId('guardian-seat-skeleton')).toHaveLength(
            GUARDIAN_SEAT_SKELETON_ROWS,
        )

        // and they stay put across the search rather than restarting under it
        await settlePreview()
        expect(screen.getByTestId('guardian-details-slot')).toBeOnTheScreen()
        expect(screen.queryAllByTestId('guardian-seat-skeleton')).toHaveLength(
            GUARDIAN_SEAT_SKELETON_ROWS,
        )
    })

    it('should list one row per seat with its verification state', async () => {
        renderScreen(makeBridge())
        await settlePreview()

        await act(async () => {
            fireEvent.press(screen.getByTestId('guardian-details-toggle'))
        })

        expect(
            screen.getAllByText(i18n.t('feature.wallet-service.seat-verified')),
        ).toHaveLength(3)
        expect(
            screen.getAllByText(i18n.t('feature.wallet-service.seat-selected')),
        ).toHaveLength(3)
        // blank `fmanName`s, so each row names the guardian by the only
        // identity there is — never a placeholder
        expect(screen.getByText('fman_01')).toBeOnTheScreen()
        expect(screen.getByText('fman_02')).toBeOnTheScreen()
        expect(screen.getByText('fman_03')).toBeOnTheScreen()
        expect(screen.queryByText('TBD GUARDIAN NAME')).toBeNull()
    })

    // `fmanName` arrives with the stack rebase onto `shaurya/fi-client-init`.
    // This locks in that the screen picks it up with no further change, and
    // that a blank name still falls back to the id rather than rendering empty.
    it('should prefer the guardian display name once the bridge sends one', async () => {
        const fedimint = makeBridge(() =>
            Promise.resolve({
                type: 'preview',
                preview: {
                    ...makePreview(),
                    seats: [
                        { ...makeSeat(1, '100000'), fmanName: 'Bright Otter' },
                        { ...makeSeat(2, '200000'), fmanName: '' },
                        makeSeat(3, '300000'),
                    ],
                },
            }),
        )
        renderScreen(fedimint)
        await settlePreview()

        await act(async () => {
            fireEvent.press(screen.getByTestId('guardian-details-toggle'))
        })

        expect(screen.getByText('Bright Otter')).toBeOnTheScreen()
        // blank and absent both fall back to the id
        expect(screen.getByText('fman_02')).toBeOnTheScreen()
        expect(screen.getByText('fman_03')).toBeOnTheScreen()
    })

    it('should warn and block continuing when too few guardians are eligible', async () => {
        const fedimint = makeBridge(() =>
            Promise.resolve(insufficientSeatsResult(10, 8)),
        )
        renderScreen(fedimint)
        await settlePreview()

        expect(
            screen.getByText(i18n.t('feature.wallet-service.not-enough-title')),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.not-enough-body', {
                    requested: 10,
                    eligible: 8,
                }),
            ),
        ).toBeOnTheScreen()
        // no quote is coming, so the cost card must not pretend to load one
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.finding-guardians'),
            ),
        ).not.toBeOnTheScreen()

        await act(async () => {
            fireEvent.press(screen.getByTestId('wallet-service-continue'))
        })

        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.confirm-count-title', {
                    count: 10,
                }),
            ),
        ).not.toBeOnTheScreen()
    })

    it('should ask the user to confirm the permanent count before continuing', async () => {
        renderScreen(makeBridge())
        await settlePreview()

        await act(async () => {
            fireEvent.press(screen.getByTestId('wallet-service-continue'))
        })

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.confirm-count-title', {
                    count: 10,
                }),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.confirm-count-body'),
            ),
        ).toBeOnTheScreen()
        // the sheet restates what is being locked in, permanently
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.confirm-count-permanent', {
                    count: 10,
                }),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('confirm-count-close')).toBeOnTheScreen()
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    it('should prepare the payment and navigate once the count is confirmed', async () => {
        const fedimint = makeBridge()
        renderScreen(fedimint)
        await settlePreview()

        await act(async () => {
            fireEvent.press(screen.getByTestId('wallet-service-continue'))
        })
        await act(async () => {
            fireEvent.press(screen.getByTestId('confirm-count-submit'))
        })

        expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledTimes(2)
        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'ConfirmWalletService',
        )
    })

    it('should drop the smaller-set suggestion at the smallest preset', async () => {
        const fedimint = makeBridge(request =>
            Promise.resolve(insufficientSeatsResult(request.federationSize, 5)),
        )
        renderScreen(fedimint)
        // the switcher is locked until the first search settles
        await settlePreview()

        fireEvent.press(screen.getByTestId('7Tab'))
        await settlePreview()

        // there is no smaller set to suggest, so only the retry line shows
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.not-enough-body-minimum', {
                    requested: 7,
                    eligible: 5,
                }),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.not-enough-body', {
                    requested: 7,
                    eligible: 5,
                }),
            ),
        ).not.toBeOnTheScreen()
    })
})
