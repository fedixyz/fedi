import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    changeOverrideCurrency,
    fetchCurrencyPrices,
    setAmountInputType,
    setCurrencyLocale,
    setFederations,
    setPayFromFederationId,
    setTransactionDisplayType,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import { BridgeError } from '@fedi/common/utils/errors'

import i18n from '../../../localization/i18n'
import SendOfflineAmount from '../../../screens/SendOfflineAmount'
import { MSats, SupportedCurrency } from '../../../types'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('SendOfflineAmount screen', () => {
    let store: ReturnType<typeof setupStore>
    let mockFedimint: MockFedimintBridge
    const user = userEvent.setup()
    const mockCalculateMaxGenerateEcash = Promise.resolve(1_999_000 as MSats)

    beforeEach(() => {
        store = setupStore()

        store.dispatch(fetchCurrencyPrices()).unwrap()
        store.dispatch(setCurrencyLocale('en-US'))
        store.dispatch(changeOverrideCurrency(SupportedCurrency.USD))

        mockFedimint = createMockFedimintBridge({
            calculateMaxGenerateEcash: mockCalculateMaxGenerateEcash,
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
            <SendOfflineAmount
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            {
                fedimint: mockFedimint,
            },
        )

        const next = i18n.t('words.next')
        const nextButton = await screen.getByText(next)

        expect(nextButton).toBeOnTheScreen()
    })

    it('should render the primary amount in fiat and the secondary amount in sats when amountInputType is fiat', async () => {
        store.dispatch(setTransactionDisplayType('fiat'))
        store.dispatch(setAmountInputType('fiat'))

        renderWithProviders(
            <SendOfflineAmount
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            {
                store,
                fedimint: mockFedimint,
            },
        )

        const button3 = await screen.getByText('3')
        const button4 = await screen.getByText('4')

        await user.press(button3)
        await user.press(button4)

        const amountFiat = await screen.getByText('34')
        const amountSats = await screen.getByText('34,000 SATS')
        const currency = await screen.getByText('USD', { exact: false })

        await waitFor(() => expect(amountFiat).toBeOnTheScreen())
        await waitFor(() => expect(amountSats).toBeOnTheScreen())
        await waitFor(() => expect(currency).toBeOnTheScreen())
    })

    it('should render the primary amount in sats and the secondary amount in fiat when amountInputType is sats', async () => {
        store.dispatch(setTransactionDisplayType('fiat'))
        store.dispatch(setAmountInputType('sats'))

        renderWithProviders(
            <SendOfflineAmount
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            {
                store,
                fedimint: mockFedimint,
            },
        )

        const button3 = await screen.getByText('3')
        const button4 = await screen.getByText('4')

        await user.press(button3)
        await user.press(button4)
        await user.press(button4)
        await user.press(button4)

        const amountFiat = await screen.getByText('3.44 USD')
        const amountSats = await screen.getByText('3,444')
        const currency = await screen.getByText('USD', { exact: false })

        await waitFor(() => expect(amountFiat).toBeOnTheScreen())
        await waitFor(() => expect(amountSats).toBeOnTheScreen())
        await waitFor(() => expect(currency).toBeOnTheScreen())
    })

    it('should prevent the user from sending more than the max ecash send balance', async () => {
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        store.dispatch(setTransactionDisplayType('fiat'))
        store.dispatch(setAmountInputType('sats'))

        mockFedimint = createMockFedimintBridge({
            calculateMaxGenerateEcash: Promise.resolve(1999000 as MSats),
        })

        renderWithProviders(
            <SendOfflineAmount
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            {
                store,
                fedimint: mockFedimint,
            },
        )

        const button3 = await screen.findByText('3')

        for (let i = 0; i < 4; i++) await user.press(button3)

        const amountInputError = screen.getByTestId('amount-input-error')

        expect(amountInputError).toBeOnTheScreen()
        expect(amountInputError).toHaveTextContent(
            'The max you can send is 1,999 sats',
        )
    })

    it('should fall back to the wallet balance if the calculateMaxGenerateEcash rpc fails', async () => {
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        store.dispatch(setTransactionDisplayType('fiat'))
        store.dispatch(setAmountInputType('sats'))

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
            <SendOfflineAmount
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
            {
                store,
                fedimint: mockFedimint,
            },
        )

        const button3 = await screen.getByText('3')

        for (let i = 0; i < 4; i++) await user.press(button3)

        const amountInputError = screen.getByTestId('amount-input-error')

        expect(amountInputError).toBeOnTheScreen()
        expect(amountInputError).toHaveTextContent(
            'The max you can send is 2,000 sats',
        )
    })
})
