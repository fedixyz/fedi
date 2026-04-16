import '@testing-library/jest-dom'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import { MSats, SupportedCurrency } from '@fedi/common/types'
import { BridgeError } from '@fedi/common/utils/errors'

import { SendOffline } from '../../../src/components/Send/SendOffline'
import i18n from '../../../src/localization/i18n'
import { AppState } from '../../../src/state/store'
import { renderWithProviders } from '../../utils/render'

describe('SendOffline', () => {
    let state: AppState
    let mockFedimint: MockFedimintBridge
    let store
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    const mockOnEcashGenerated = jest.fn()
    const mockOnPaymentSent = jest.fn()
    const mockCalculateMaxGenerateEcash = Promise.resolve(1_999_000 as MSats)
    const mockGenerateEcash = Promise.resolve({ ecash: 'ecash-token-abcdef' })

    beforeEach(() => {
        store = setupStore()
        state = store.getState()
        mockFedimint = createMockFedimintBridge({
            calculateMaxGenerateEcash: mockCalculateMaxGenerateEcash,
            generateEcash: mockGenerateEcash,
        })

        jest.clearAllTimers()
        jest.useFakeTimers()
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it("should render the 'next' button on the screen", async () => {
        renderWithProviders(
            <SendOffline
                onEcashGenerated={mockOnEcashGenerated}
                onPaymentSent={mockOnPaymentSent}
                onCancel={() => {}}
                federationId="test-federation-id"
            />,
            {
                fedimint: mockFedimint,
            },
        )

        const nextButton = await screen.findByText(i18n.t('words.next'))
        expect(nextButton).toBeInTheDocument()
    })

    it('should call onCancel when the cancel button is clicked', async () => {
        const mockOnCancel = jest.fn()

        renderWithProviders(
            <SendOffline
                onEcashGenerated={mockOnEcashGenerated}
                onPaymentSent={mockOnPaymentSent}
                onCancel={mockOnCancel}
                federationId={mockFederation1.id}
            />,
            {
                fedimint: mockFedimint,
                preloadedState: {
                    currency: {
                        ...state.currency,
                        overrideCurrency: SupportedCurrency.USD,
                        currencyLocale: 'en-US',
                        btcUsdRate: 100000,
                    },
                    environment: {
                        ...state.environment,
                        transactionDisplayType: 'fiat',
                        amountInputType: 'sats',
                    },
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        recentlyUsedFederationIds: [mockFederation1.id],
                        payFromFederationId: mockFederation1.id,
                    },
                },
            },
        )

        // Press 5 on numpad
        await user.click(screen.getByText('5'))

        const nextButton = await screen.findByText(i18n.t('words.next'))

        await user.click(nextButton)

        const cancelButton = await screen.findByText(
            i18n.t('feature.send.cancel-send'),
        )

        await user.click(cancelButton)

        expect(mockOnCancel).toHaveBeenCalledWith('ecash-token-abcdef')
    })

    it('should render the primary amount in fiat and the secondary amount in sats when amountInputType is fiat', async () => {
        renderWithProviders(
            <SendOffline
                onEcashGenerated={mockOnEcashGenerated}
                onPaymentSent={mockOnPaymentSent}
                onCancel={() => {}}
                federationId="test-federation-id"
            />,
            {
                fedimint: mockFedimint,
                preloadedState: {
                    currency: {
                        ...state.currency,
                        overrideCurrency: SupportedCurrency.USD,
                        currencyLocale: 'en-US',
                        btcUsdRate: 100000,
                    },
                    environment: {
                        ...state.environment,
                        transactionDisplayType: 'fiat',
                        amountInputType: 'fiat',
                    },
                },
            },
        )
        await user.click(screen.getByText('3'))
        await user.click(screen.getByText('4'))

        await waitFor(() => {
            expect(screen.getByText('34')).toBeInTheDocument()
            expect(screen.getByText('34,000')).toBeInTheDocument()
        })
    })

    it('should render the primary amount in sats and the secondary amount in fiat when amountInputType is sats', async () => {
        renderWithProviders(
            <SendOffline
                onEcashGenerated={mockOnEcashGenerated}
                onPaymentSent={mockOnPaymentSent}
                onCancel={() => {}}
                federationId="test-federation-id"
            />,
            {
                fedimint: mockFedimint,
                preloadedState: {
                    currency: {
                        ...state.currency,
                        overrideCurrency: SupportedCurrency.USD,
                        currencyLocale: 'en-US',
                        btcUsdRate: 100000,
                    },
                    environment: {
                        ...state.environment,
                        transactionDisplayType: 'fiat',
                        amountInputType: 'sats',
                    },
                },
            },
        )

        const num3 = screen.getByText('3')
        const num4 = screen.getByText('4')

        await user.click(num3)
        await user.click(num4)
        await user.click(num4)
        await user.click(num4)

        expect(screen.getByText('3.44')).toBeInTheDocument()
        expect(screen.getByText('3,444')).toBeInTheDocument()
    })

    it('should prevent the user from sending more than the max ecash send balance', async () => {
        renderWithProviders(
            <SendOffline
                onEcashGenerated={mockOnEcashGenerated}
                onPaymentSent={mockOnPaymentSent}
                onCancel={() => {}}
                federationId="1"
            />,
            {
                fedimint: mockFedimint,
                preloadedState: {
                    currency: {
                        ...state.currency,
                        overrideCurrency: SupportedCurrency.USD,
                        currencyLocale: 'en-US',
                        btcUsdRate: 10000,
                    },
                    environment: {
                        ...state.environment,
                        transactionDisplayType: 'fiat',
                        amountInputType: 'sats',
                    },
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        recentlyUsedFederationIds: [mockFederation1.id],
                        payFromFederationId: mockFederation1.id,
                    },
                },
            },
        )

        const button3 = screen.getByText('3')

        for (let i = 0; i < 4; i++) await user.click(button3)

        const amountInputError = screen.getByText('The max you can send is')

        expect(amountInputError).toBeInTheDocument()
        // The node with `1,999 sats` is a clickable button and isn't matchable with `getByText`
        expect(amountInputError).toHaveTextContent(
            'The max you can send is 1,999 sats',
        )
    })

    it('should fall back to the wallet balance if the calculateMaxGenerateEcash rpc fails', async () => {
        mockFedimint = createMockFedimintBridge({
            calculateMaxGenerateEcash: Promise.reject(
                new BridgeError({
                    error: 'error',
                    detail: 'error',
                    errorCode: 'badRequest',
                }),
            ),
        })

        renderWithProviders(
            <SendOffline
                onEcashGenerated={mockOnEcashGenerated}
                onPaymentSent={mockOnPaymentSent}
                onCancel={() => {}}
                federationId="1"
            />,
            {
                fedimint: mockFedimint,
                preloadedState: {
                    currency: {
                        ...state.currency,
                        overrideCurrency: SupportedCurrency.USD,
                        currencyLocale: 'en-US',
                        btcUsdRate: 10000,
                    },
                    environment: {
                        ...state.environment,
                        transactionDisplayType: 'fiat',
                        amountInputType: 'sats',
                    },
                    federation: {
                        ...state.federation,
                        federations: [mockFederation1],
                        recentlyUsedFederationIds: [mockFederation1.id],
                        payFromFederationId: mockFederation1.id,
                    },
                },
            },
        )

        const button3 = screen.getByText('3')

        for (let i = 0; i < 4; i++) await user.click(button3)

        const amountInputError = screen.getByText('The max you can send is')

        expect(amountInputError).toBeInTheDocument()
        expect(amountInputError).toHaveTextContent(
            'The max you can send is 2,000 sats',
        )
    })
})
