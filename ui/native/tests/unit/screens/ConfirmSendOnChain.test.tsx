import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import {
    selectLastUsedSendMethod,
    setFederations,
    setPayFromFederationId,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { MSats, ParserDataType, Sats } from '@fedi/common/types'

import ConfirmSendOnChain from '../../../screens/ConfirmSendOnChain'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

jest.mock('@fedi/common/hooks/pay', () => ({
    useOmniPaymentState: jest.fn(),
}))

const mockUseOmniPaymentState = useOmniPaymentState as jest.MockedFunction<
    typeof useOmniPaymentState
>

const mockOmniPaymentState = (
    handleOmniSend: ReturnType<typeof useOmniPaymentState>['handleOmniSend'],
) =>
    mockUseOmniPaymentState.mockReturnValue({
        isReadyToPay: true,
        exactAmount: 1000 as Sats,
        minimumAmount: 1 as Sats,
        maximumAmount: 100_000 as Sats,
        inputAmount: 1000 as Sats,
        description: null,
        feeDetails: {
            fediAppFee: 0 as MSats,
            fediGuardianFee: 0 as MSats,
            networkFee: 0 as MSats,
        },
        sendTo: 'recipient',
        setInputAmount: jest.fn(),
        handleOmniInput: jest.fn(),
        handleOmniSend,
        error: null,
    } as unknown as ReturnType<typeof useOmniPaymentState>)

describe('ConfirmSendOnChain screen', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeEach(() => {
        store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    const renderScreen = () =>
        renderWithProviders(
            <ConfirmSendOnChain
                navigation={mockNavigation as any}
                route={
                    {
                        key: 'ConfirmSendOnChain',
                        name: 'ConfirmSendOnChain',
                        params: {
                            parsedData: {
                                type: ParserDataType.BitcoinAddress,
                                data: {} as any,
                            },
                        },
                    } as any
                }
            />,
            { store },
        )

    it('remembers on-chain once the send is submitted', async () => {
        const handleOmniSend = jest.fn(() => Promise.resolve(undefined))
        mockOmniPaymentState(handleOmniSend as any)
        renderScreen()

        await user.press(screen.getByTestId('SendConfirmButton'))

        await waitFor(() =>
            expect(mockNavigation.replace).toHaveBeenCalledWith(
                'SendSuccess',
                expect.anything(),
            ),
        )
        expect(selectLastUsedSendMethod(store.getState())).toBe('onchain')
    })

    it('does not remember on-chain when the send fails', async () => {
        const handleOmniSend = jest.fn(() =>
            Promise.reject(new Error('send failed')),
        )
        mockOmniPaymentState(handleOmniSend as any)
        renderScreen()

        await user.press(screen.getByTestId('SendConfirmButton'))

        await waitFor(() => expect(handleOmniSend).toHaveBeenCalled())
        expect(mockNavigation.replace).not.toHaveBeenCalled()
        expect(selectLastUsedSendMethod(store.getState())).toBeNull()
    })
})
