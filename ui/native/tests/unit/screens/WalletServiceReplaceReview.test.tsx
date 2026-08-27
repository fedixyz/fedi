import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    RpcFiFormationActionRequired,
    RpcFiGuardianReplacementRequirements,
    RpcFiOperationResult,
    RpcFiReplacementPreview,
} from '@fedi/common/types/bindings'

import i18n from '../../../localization/i18n'
import WalletServiceReplaceReview from '../../../screens/WalletServiceReplaceReview'
import { mockNavigation, mockToast } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

// typed as the replacement variant, not the action union: callers that need
// the union widen for free, and the narrow sites stop refusing it
const makeReplacementRequirements =
    (): RpcFiGuardianReplacementRequirements => ({
        replacementId: 'replacement-1',
        seats: [
            {
                index: 0,
                previousFmanId: 'fman-old-0',
                previousFmanName: 'old oak',
                previousQuoteId: 'quote-0',
                previousLocator: 'locator-0',
            },
        ],
    })

const makeActionRequired = (): RpcFiFormationActionRequired => ({
    type: 'replaceGuardians',
    requirements: makeReplacementRequirements(),
})

const makePreview = (
    overrides: Partial<RpcFiReplacementPreview> = {},
): RpcFiReplacementPreview => ({
    previewId: 'replacement-preview-1',
    requirements: makeReplacementRequirements(),
    totalAdvertisedMsats: '21000',
    seats: [
        {
            index: 0,
            fmanId: 'fman-replacement-0',
            fmanName: 'replacement zero',
            advertisedPriceMsats: '21000',
            provenance: 'registry',
        },
    ],
    ...overrides,
})

const makeFormation = (
    actionRequired: RpcFiFormationActionRequired | null,
) => ({
    formationId: 'formation-1',
    phase: 'acquiringSeats' as const,
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort' as const,
        fedimintdVersion: '0.11.1-fedi13',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh' as const,
    actionRequired,
    paymentOutputsStarted: false,
    milestones: {
        ecashSent: false,
        guardiansConfirmed: false,
        walletServiceCreated: false,
    },
    inviteCode: null,
    lastError: null,
})

const renderReview = ({
    actionRequired = makeActionRequired(),
    replacementPreview = null as RpcFiReplacementPreview | null,
    fiClientPreviewReplacements,
    fiClientApplyReplacements,
}: {
    actionRequired?: RpcFiFormationActionRequired | null
    replacementPreview?: RpcFiReplacementPreview | null
    fiClientPreviewReplacements?:
        | { type: 'preview'; preview: RpcFiReplacementPreview }
        | {
              type: 'error'
              error: { code: string; message: string; detail: unknown }
          }
    fiClientApplyReplacements?: RpcFiOperationResult
} = {}) => {
    const user = userEvent.setup()
    const fedimint = createMockFedimintBridge({
        fiClientPreviewReplacements: Promise.resolve(
            fiClientPreviewReplacements ?? {
                type: 'preview',
                preview: replacementPreview ?? makePreview(),
            },
        ),
        fiClientApplyReplacements: Promise.resolve(
            fiClientApplyReplacements ?? { type: 'success' },
        ),
    })
    const store = setupStore({
        fi: {
            status: {
                type: 'formation',
                formation: makeFormation(actionRequired),
            },
            clientError: null,
            creationHighWaterMark: null,
            draft: { name: '', size: 7 },
            selectionPreview: null,
            replacementPreview,
            eligiblePayers: null,
            payerError: null,
            liquidity: {
                operation: null,
                hasRead: true,
                errorCode: null,
                isRequesting: false,
            },
            operationError: null,
        },
    })

    renderWithProviders(
        <WalletServiceReplaceReview
            navigation={mockNavigation as any}
            route={{} as any}
        />,
        { store, fedimint },
    )

    return { user, fedimint, store }
}

describe('WalletServiceReplaceReview screen', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should preview replacements on mount when a replacement is parked', async () => {
        const { fedimint } = renderReview()

        await waitFor(() => {
            expect(fedimint.fiClientPreviewReplacements).toHaveBeenCalledTimes(
                1,
            )
        })
    })

    it('should render the seat rows and total once the preview loads', async () => {
        renderReview({
            replacementPreview: makePreview({
                totalAdvertisedMsats: '21000',
                seats: [
                    {
                        index: 0,
                        fmanId: 'fman-0',
                        fmanName: 'seat zero',
                        advertisedPriceMsats: '21000',
                        provenance: 'registry',
                    },
                ],
            }),
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.seat-index', { index: 1 }),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('replacement-cost')).toBeOnTheScreen()
        expect(
            screen.getByTestId('approve-replacements-button'),
        ).toBeOnTheScreen()
    })

    it('should approve with the previewed id and total, then go back', async () => {
        const preview = makePreview({
            previewId: 'replacement-preview-9',
            totalAdvertisedMsats: '55000',
        })
        const { user, fedimint } = renderReview({ replacementPreview: preview })

        await screen.findByTestId('approve-replacements-button')
        await user.press(screen.getByTestId('approve-replacements-button'))

        await waitFor(() => {
            expect(fedimint.fiClientApplyReplacements).toHaveBeenCalledWith(
                'replacement-preview-9',
                '55000',
            )
        })
        expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
    })

    it('should toast and re-preview when the approval is rejected', async () => {
        const preview = makePreview()
        const { user, store } = renderReview({
            replacementPreview: preview,
            fiClientApplyReplacements: {
                type: 'error',
                error: {
                    code: 'selection',
                    message: 'subset already applied',
                    detail: null,
                },
            },
        })

        await screen.findByTestId('approve-replacements-button')
        await user.press(screen.getByTestId('approve-replacements-button'))

        await waitFor(() => {
            expect(mockToast.show).toHaveBeenCalledWith({
                content: `${i18n.t(
                    'feature.wallet-service.error-selection',
                )} ${i18n.t('feature.wallet-service.try-again-hint')}`,
                status: 'error',
            })
        })
        expect(mockNavigation.goBack).not.toHaveBeenCalled()
        // the rejected preview was dropped, so a fresh preview is fetched
        await waitFor(() => {
            expect(store.getState().fi.operationError).toBeNull()
        })
    })

    it('should show the not-found banner with retry when too few candidates exist', async () => {
        const { user, fedimint } = renderReview({
            fiClientPreviewReplacements: {
                type: 'error',
                error: {
                    code: 'selection',
                    message: 'not enough candidates',
                    detail: {
                        type: 'insufficientFmanSeats',
                        requested: 1,
                        selected: 0,
                        seen: 3,
                        eligible: 0,
                    },
                },
            },
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.not-enough-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.replace-not-found', {
                    requested: 1,
                    selected: 0,
                }),
            ),
        ).toBeOnTheScreen()
        expect(screen.queryByTestId('approve-replacements-button')).toBeNull()

        const retryButton = screen.getByText(i18n.t('words.retry'))
        expect(fedimint.fiClientPreviewReplacements).toHaveBeenCalledTimes(1)

        await user.press(retryButton)
        await waitFor(() => {
            expect(fedimint.fiClientPreviewReplacements).toHaveBeenCalledTimes(
                2,
            )
        })
    })

    it('should not offer return-home beside an approvable replacement', async () => {
        renderReview()

        // once candidates exist the one decision on screen is approval;
        // a second exit button diluted it (kc, 23 Aug)
        await screen.findByTestId('approve-replacements-button')
        expect(screen.queryByTestId('return-home-button')).not.toBeOnTheScreen()
    })

    it('should go back immediately when there is nothing parked to review', () => {
        renderReview({ actionRequired: null })

        expect(mockNavigation.goBack).toHaveBeenCalledTimes(1)
    })
})
