import { cleanup, fireEvent, screen } from '@testing-library/react-native'

import { MiniAppSeedOverlay } from '@fedi/native/components/feature/fedimods/MiniAppSeedOverlay'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

describe('components/feature/fedimods/MiniAppSeedOverlay', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should identify the requesting origin without a remember option', () => {
        renderWithProviders(
            <MiniAppSeedOverlay
                origin="https://example.com"
                onApprove={jest.fn()}
                onDeny={jest.fn()}
            />,
        )

        expect(screen.getByText('https://example.com')).toBeOnTheScreen()
        expect(
            screen.getByText('This app gets its own private key.'),
        ).toBeOnTheScreen()
        expect(screen.queryByText(/remember/i)).toBeNull()
    })

    it('should wire deny, approve, and backdrop actions', () => {
        const onApprove = jest.fn()
        const onDeny = jest.fn()
        renderWithProviders(
            <MiniAppSeedOverlay
                origin="https://example.com"
                onApprove={onApprove}
                onDeny={onDeny}
            />,
        )

        fireEvent.press(screen.getByText('Deny'))
        fireEvent.press(screen.getByText('Approve'))
        fireEvent.press(screen.getByTestId('RNE__Overlay__backdrop'))

        expect(onApprove).toHaveBeenCalledTimes(1)
        expect(onDeny).toHaveBeenCalledTimes(2)
    })

    it('should stay hidden without a pending request', () => {
        renderWithProviders(
            <MiniAppSeedOverlay
                origin={null}
                onApprove={jest.fn()}
                onDeny={jest.fn()}
            />,
        )

        expect(screen.queryByText('Share a private key?')).toBeNull()
    })
})
