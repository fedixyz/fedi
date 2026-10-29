import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    RpcFaFormationActionRequired,
    RpcFaGuardianReplacementRequirements,
    RpcFaOperationResult,
    RpcFaReplacementPreview,
} from '@fedi/common/types/bindings'

import i18n from '../../../localization/i18n'
import WalletServiceReplaceReview from '../../../screens/WalletServiceReplaceReview'
import { mockNavigation, mockToast } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

// typed as the replacement variant, not the action union: callers that need
// the union widen for free, and the narrow sites stop refusing it
const makeReplacementRequirements =
    (): RpcFaGuardianReplacementRequirements => ({
        replacementId: 'replacement-1',
        seats: [
            {
                index: 0,
                previousMgId: 'mg-old-0',
                previousMgName: 'old oak',
                previousQuoteId: 'quote-0',
                previousLocator: 'locator-0',
            },
        ],
    })

const makeActionRequired = (): RpcFaFormationActionRequired => ({
    type: 'replaceGuardians',
    requirements: makeReplacementRequirements(),
})

const makePreview = (
    overrides: Partial<RpcFaReplacementPreview> = {},
): RpcFaReplacementPreview => ({
    previewId: 'replacement-preview-1',
    requirements: makeReplacementRequirements(),
    totalAdvertisedMsats: '21000',
    seats: [
        {
            index: 0,
            mgId: 'mg-replacement-0',
            mgName: 'replacement zero',
            advertisedPriceMsats: '21000',
            provenance: 'registry',
        },
    ],
    ...overrides,
})

const makeFormation = (
    actionRequired: RpcFaFormationActionRequired | null,
) => ({
    formationId: 'formation-1',
    phase: 'acquiringSeats' as const,
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort' as const,
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh' as const,
    actionRequired,
    paymentOutputsStarted: false,
    milestones: {
        ecashSent: false,
        guardiansConfirmed: false,
    },
    inviteCode: null,
    lastError: null,
})

const renderReview = ({
    actionRequired = makeActionRequired(),
    replacementPreview = null as RpcFaReplacementPreview | null,
    faClientPreviewReplacements,
    faClientApplyReplacements,
}: {
    actionRequired?: RpcFaFormationActionRequired | null
    replacementPreview?: RpcFaReplacementPreview | null
    faClientPreviewReplacements?:
        | { type: 'preview'; preview: RpcFaReplacementPreview }
        | {
              type: 'error'
              error: { code: string; message: string; detail: unknown }
          }
    faClientApplyReplacements?: RpcFaOperationResult
} = {}) => {
    const user = userEvent.setup()
    const fedimint = createMockFedimintBridge({
        faClientPreviewReplacements: Promise.resolve(
            faClientPreviewReplacements ?? {
                type: 'preview',
                preview: replacementPreview ?? makePreview(),
            },
        ),
        faClientApplyReplacements: Promise.resolve(
            faClientApplyReplacements ?? { type: 'success' },
        ),
    })
    const store = setupStore({
        fi: {
            status: {
                type: 'formation',
                formation: makeFormation(actionRequired),
            },
            clientError: null,
            federationJoin: null,
            creationHighWaterMark: null,
            walletServiceMetadata: {
                formationId: null,
                published: null,
                holds: {},
                status: 'idle',
                latestRequestId: null,
            },
            draft: { name: '', size: 7 },
            selectionPreview: null,
            replacementPreview,
            topUpInvoice: null,
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
            expect(fedimint.faClientPreviewReplacements).toHaveBeenCalledTimes(
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
                        mgId: 'mg-0',
                        mgName: 'seat zero',
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
            expect(fedimint.faClientApplyReplacements).toHaveBeenCalledWith(
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
            faClientApplyReplacements: {
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
            faClientPreviewReplacements: {
                type: 'error',
                error: {
                    code: 'selection',
                    message: 'not enough candidates',
                    detail: {
                        type: 'insufficientMgSeats',
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
        expect(fedimint.faClientPreviewReplacements).toHaveBeenCalledTimes(1)

        await user.press(retryButton)
        await waitFor(() => {
            expect(fedimint.faClientPreviewReplacements).toHaveBeenCalledTimes(
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
