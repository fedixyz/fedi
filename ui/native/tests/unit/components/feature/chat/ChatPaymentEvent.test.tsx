import { Text } from '@rneui/themed'
import {
    cleanup,
    fireEvent,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import {
    selectSelectedChatMessage,
    setFeatureFlags,
    setMatrixAuth,
    setupStore,
} from '@fedi/common/redux'
import { createMockPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { MatrixAuth } from '@fedi/common/types'
import { FeatureCatalog } from '@fedi/common/types/bindings'

import {
    PaymentEventButtons,
    PaymentEventContainer,
} from '../../../../../components/feature/chat/ChatPaymentEvent'
import { renderWithProviders } from '../../../../utils/render'

const ROOM_ID = '!payment-room:example.com'
const MEMBER_ID = '@member:example.com'

function makeStore({ reactionsEnabled }: { reactionsEnabled: boolean }) {
    const store = setupStore()
    store.dispatch(
        setFeatureFlags({
            message_reactions: reactionsEnabled ? {} : null,
        } as FeatureCatalog),
    )
    store.dispatch(
        setMatrixAuth({
            userId: MEMBER_ID,
            deviceId: 'device-1',
        } as MatrixAuth),
    )
    return store
}

describe('PaymentEventContainer', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should select the payment for message actions on long press', async () => {
        const store = makeStore({ reactionsEnabled: true })
        const event = createMockPaymentEvent({ roomId: ROOM_ID })

        renderWithProviders(
            <PaymentEventContainer event={event}>
                <Text>Payment of 1000 sats</Text>
            </PaymentEventContainer>,
            { store },
        )

        fireEvent(screen.getByText('Payment of 1000 sats'), 'longPress')

        await waitFor(() => {
            expect(selectSelectedChatMessage(store.getState())).toEqual(event)
        })
    })

    it('should ignore long press when reactions are disabled', () => {
        const store = makeStore({ reactionsEnabled: false })
        const event = createMockPaymentEvent({ roomId: ROOM_ID })

        renderWithProviders(
            <PaymentEventContainer event={event}>
                <Text>Payment of 1000 sats</Text>
            </PaymentEventContainer>,
            { store },
        )

        fireEvent(screen.getByText('Payment of 1000 sats'), 'longPress')

        expect(selectSelectedChatMessage(store.getState())).toBe(null)
    })

    it('should open message actions, not the button, on a long press of a payment button', async () => {
        const store = makeStore({ reactionsEnabled: true })
        const event = createMockPaymentEvent({ roomId: ROOM_ID })
        const pay = jest.fn()
        const user = userEvent.setup()

        renderWithProviders(
            <PaymentEventContainer event={event}>
                <PaymentEventButtons
                    buttons={[{ label: 'Pay', handler: pay }]}
                />
            </PaymentEventContainer>,
            { store },
        )

        await user.longPress(screen.getByText('Pay'))

        await waitFor(() => {
            expect(selectSelectedChatMessage(store.getState())).toEqual(event)
        })
        expect(pay).not.toHaveBeenCalled()
    })

    it('should not run a payment button on long press when reactions are disabled', async () => {
        const store = makeStore({ reactionsEnabled: false })
        const event = createMockPaymentEvent({ roomId: ROOM_ID })
        const pay = jest.fn()
        const user = userEvent.setup()

        renderWithProviders(
            <PaymentEventContainer event={event}>
                <PaymentEventButtons
                    buttons={[{ label: 'Pay', handler: pay }]}
                />
            </PaymentEventContainer>,
            { store },
        )

        await user.longPress(screen.getByText('Pay'))

        expect(pay).not.toHaveBeenCalled()
        expect(selectSelectedChatMessage(store.getState())).toBe(null)
    })

    it('should still run a payment button on a tap', async () => {
        const store = makeStore({ reactionsEnabled: true })
        const event = createMockPaymentEvent({ roomId: ROOM_ID })
        const pay = jest.fn()
        const user = userEvent.setup()

        renderWithProviders(
            <PaymentEventContainer event={event}>
                <PaymentEventButtons
                    buttons={[{ label: 'Pay', handler: pay }]}
                />
            </PaymentEventContainer>,
            { store },
        )

        await user.press(screen.getByText('Pay'))

        expect(pay).toHaveBeenCalledTimes(1)
        expect(selectSelectedChatMessage(store.getState())).toBe(null)
    })
})
