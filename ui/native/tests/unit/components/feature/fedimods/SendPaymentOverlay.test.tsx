import {
    act,
    cleanup,
    fireEvent,
    screen,
    userEvent,
} from '@testing-library/react-native'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import {
    setFederations,
    setInvoiceToPay,
    setLnurlPayment,
    setPayFromFederationId,
    setSiteInfo,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { MSats, ParserDataType, Sats } from '@fedi/common/types'
import i18n from '@fedi/native/localization/i18n'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import { SendPaymentOverlay } from '../../../../../components/feature/fedimods/SendPaymentOverlay'

jest.mock('@fedi/common/hooks/pay', () => ({
    useOmniPaymentState: jest.fn(),
}))

jest.mock('@fedi/common/hooks/transactions', () => ({
    useFeeDisplayUtils: () => ({
        feeBreakdownTitle: 'Fee details',
        makeLightningFeeContent: () => ({
            formattedTotalFee: '1 sat',
            feeItemsBreakdown: [
                {
                    label: 'Network fee',
                    formattedAmount: '1 sat',
                },
            ],
        }),
    }),
}))

jest.mock('../../../../../components/ui/AmountInput', () => {
    const React = jest.requireActual('react')
    const { Text } = jest.requireActual('react-native')

    return {
        __esModule: true,
        default: () => React.createElement(Text, null, 'amount input'),
    }
})

jest.mock(
    '../../../../../components/feature/send/FederationWalletSelector',
    () => {
        const React = jest.requireActual('react')
        const { Text } = jest.requireActual('react-native')

        return {
            __esModule: true,
            default: () => React.createElement(Text, null, 'wallet selector'),
        }
    },
)

jest.mock('../../../../../components/feature/send/SendPreviewDetails', () => {
    const React = jest.requireActual('react')
    const { Pressable, Text } = jest.requireActual('react-native')

    return {
        __esModule: true,
        default: ({ onPressFees }: { onPressFees: () => void }) =>
            React.createElement(
                Pressable,
                { testID: 'fee-info-button', onPress: onPressFees },
                React.createElement(Text, null, 'fee info'),
            ),
    }
})

describe('components/feature/fedimods/SendPaymentOverlay', () => {
    const user = userEvent.setup()
    const mockUseOmniPaymentState = useOmniPaymentState as jest.MockedFunction<
        typeof useOmniPaymentState
    >
    const paymentRequestTitle = i18n.t('feature.fedimods.payment-request', {
        fediMod: 'Mini App',
    })

    const showInvoiceToPay = (
        store: ReturnType<typeof setupStore>,
        invoice: string,
    ) => {
        store.dispatch(
            setInvoiceToPay({
                invoice,
                paymentHash: 'payment-hash',
                amount: 1000 as MSats,
                description: 'test invoice',
            }),
        )
    }

    const renderOverlay = () => {
        const store = setupStore()
        const onReject = jest.fn()
        const onAccept = jest.fn()

        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        store.dispatch(
            setSiteInfo({
                title: 'Mini App',
                url: 'https://mini-app.example',
                icon: null,
            }),
        )
        showInvoiceToPay(store, 'lnbc1test')

        renderWithProviders(
            <SendPaymentOverlay onReject={onReject} onAccept={onAccept} />,
            { store },
        )

        return {
            onAccept,
            onReject,
            store,
        }
    }

    beforeEach(() => {
        jest.clearAllMocks()
        mockUseOmniPaymentState.mockReturnValue({
            inputAmount: 10 as Sats,
            setInputAmount: jest.fn(),
            expectedOmniInputTypes: [
                ParserDataType.BitcoinAddress,
                ParserDataType.Bip21,
                ParserDataType.Bolt11,
                ParserDataType.LnurlPay,
                ParserDataType.CashuEcash,
            ],
            exactAmount: 10 as Sats,
            minimumAmount: 1 as Sats,
            maximumAmount: 100 as Sats,
            description: '',
            sendTo: '',
            resetOmniPaymentState: jest.fn(),
            feeDetails: {
                fediAppFee: 0 as MSats,
                fediGuardianFee: 0 as MSats,
                federationFee: 0 as MSats,
                networkFee: 1000 as MSats,
            },
            handleOmniInput: jest.fn(),
            handleOmniSend: jest.fn(),
            isLoading: false,
            error: null,
            isReadyToPay: true,
        } as ReturnType<typeof useOmniPaymentState>)
    })

    afterEach(() => {
        cleanup()
    })

    it('should show the payment request title and actions initially', () => {
        renderOverlay()

        expect(screen.getByText(paymentRequestTitle)).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.reject'))).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.accept'))).toBeOnTheScreen()
    })

    it('should show fee details and fee rows from the WebLN payment request', async () => {
        renderOverlay()

        await user.press(screen.getByTestId('fee-info-button'))

        expect(screen.getByText('Fee details')).toBeOnTheScreen()
        expect(screen.getByText('Network fee')).toBeOnTheScreen()
        expect(screen.getByText('1 sat')).toBeOnTheScreen()
        expect(screen.queryByText(paymentRequestTitle)).not.toBeOnTheScreen()
        expect(screen.queryByText(i18n.t('words.reject'))).not.toBeOnTheScreen()
        expect(screen.queryByText(i18n.t('words.accept'))).not.toBeOnTheScreen()
    })

    it('should dismiss WebLN fee details with the close button', async () => {
        renderOverlay()

        await user.press(screen.getByTestId('fee-info-button'))

        await user.press(screen.getByTestId('fee-breakdown-close'))

        expect(screen.queryByText('Fee details')).not.toBeOnTheScreen()
        expect(screen.getByText(paymentRequestTitle)).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.reject'))).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.accept'))).toBeOnTheScreen()
    })

    it('should dismiss WebLN fee details from the backdrop without rejecting the payment request', async () => {
        const { onReject } = renderOverlay()

        await user.press(screen.getByTestId('fee-info-button'))

        fireEvent.press(screen.getByTestId('RNE__Overlay__backdrop'))

        expect(onReject).not.toHaveBeenCalled()
        expect(screen.queryByText('Fee details')).not.toBeOnTheScreen()
        expect(screen.getByText(paymentRequestTitle)).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.reject'))).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.accept'))).toBeOnTheScreen()
    })

    it('should reject the WebLN payment request from the backdrop in payment mode', () => {
        const { onReject } = renderOverlay()

        fireEvent.press(screen.getByTestId('RNE__Overlay__backdrop'))

        expect(onReject).toHaveBeenCalledTimes(1)
    })

    it('should reopen new WebLN payment requests in payment mode after an external close', async () => {
        const { store } = renderOverlay()

        await user.press(screen.getByTestId('fee-info-button'))

        expect(screen.getByText('Fee details')).toBeOnTheScreen()

        act(() => {
            store.dispatch(setInvoiceToPay(null))
            store.dispatch(setLnurlPayment(null))
        })

        act(() => {
            showInvoiceToPay(store, 'lnbc1test-next')
        })

        expect(screen.queryByText('Fee details')).not.toBeOnTheScreen()
        expect(screen.getByText(paymentRequestTitle)).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.reject'))).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.accept'))).toBeOnTheScreen()
    })
})
