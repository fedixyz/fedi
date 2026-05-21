import { cleanup, screen, userEvent } from '@testing-library/react-native'

import FediLinkOverlay from '@fedi/native/components/feature/onboarding/FediLinkOverlay'
import i18n from '@fedi/native/localization/i18n'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

describe('FediLinkOverlay', () => {
    let user: ReturnType<typeof userEvent.setup>

    beforeEach(() => {
        jest.clearAllMocks()
        user = userEvent.setup()
    })

    afterEach(() => {
        cleanup()
    })

    it('should call onReject when the no button is pressed', async () => {
        const onReject = jest.fn()

        renderWithProviders(
            <FediLinkOverlay
                show
                onDismiss={() => {}}
                onConfirm={() => {}}
                onReject={onReject}
            />,
        )

        await user.press(screen.getByText(i18n.t('words.no')))

        expect(onReject).toHaveBeenCalledTimes(1)
    })

    it('should call onConfirm when the yes button is pressed', async () => {
        const onConfirm = jest.fn()

        renderWithProviders(
            <FediLinkOverlay
                show
                onDismiss={() => {}}
                onConfirm={onConfirm}
                onReject={() => {}}
            />,
        )

        await user.press(screen.getByText(i18n.t('words.yes')))

        expect(onConfirm).toHaveBeenCalledTimes(1)
    })
})
