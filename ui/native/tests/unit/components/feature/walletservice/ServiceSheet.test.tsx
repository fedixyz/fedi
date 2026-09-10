import { cleanup, screen, userEvent } from '@testing-library/react-native'
import React from 'react'

import {
    ServiceSheet,
    ServiceSheetButton,
} from '../../../../../components/feature/walletservice/ServiceSheet'
import { renderWithProviders } from '../../../../utils/render'

const TITLE = 'Sheet title'
const DESCRIPTION = 'Sheet description'
const NOTE = 'Sheet note'
const CLOSE_TEST_ID = 'service-sheet-close'

const renderSheet = (
    props: Partial<React.ComponentProps<typeof ServiceSheet>> = {},
) => {
    const onDismiss = jest.fn()
    const onPrimary = jest.fn()
    const onSecondary = jest.fn()
    const buttons: ServiceSheetButton[] = [
        { text: 'Primary', primary: true, onPress: onPrimary },
        { text: 'Secondary', onPress: onSecondary },
    ]
    const user = userEvent.setup()
    renderWithProviders(
        <ServiceSheet
            show
            title={TITLE}
            description={DESCRIPTION}
            onDismiss={onDismiss}
            buttons={buttons}
            {...props}
        />,
    )
    return { onDismiss, onPrimary, onSecondary, user }
}

describe('ServiceSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render the title and description', () => {
        renderSheet()

        expect(screen.getByText(TITLE)).toBeOnTheScreen()
        expect(screen.getByText(DESCRIPTION)).toBeOnTheScreen()
    })

    it('should render only the handle when no title is given', () => {
        renderSheet({ title: undefined, description: undefined })

        expect(screen.queryByText(TITLE)).toBeNull()
        expect(screen.queryByText(DESCRIPTION)).toBeNull()
        expect(screen.getByText('Primary')).toBeOnTheScreen()
    })

    it('should not render a close button by default', () => {
        renderSheet({ closeTestID: CLOSE_TEST_ID })

        expect(screen.queryByTestId(CLOSE_TEST_ID)).toBeNull()
    })

    it('should call onDismiss when the close button is pressed', async () => {
        const { onDismiss, user } = renderSheet({
            showClose: true,
            closeTestID: CLOSE_TEST_ID,
        })

        await user.press(screen.getByTestId(CLOSE_TEST_ID))

        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('should call onPress of a button when pressed', async () => {
        const { onPrimary, onSecondary, user } = renderSheet()

        await user.press(screen.getByText('Secondary'))

        expect(onSecondary).toHaveBeenCalledTimes(1)
        expect(onPrimary).not.toHaveBeenCalled()
    })

    it('should disable the buttons while loading', async () => {
        const { onPrimary, onSecondary, user } = renderSheet({
            loading: true,
        })

        // the primary is replaced by the ring while loading
        await user.press(screen.getByText('Secondary'))

        expect(onSecondary).not.toHaveBeenCalled()
        expect(onPrimary).not.toHaveBeenCalled()
        expect(screen.queryByText('Primary')).toBeNull()
    })

    it('should render the note when given', () => {
        renderSheet({ note: NOTE })

        expect(screen.getByText(NOTE)).toBeOnTheScreen()
    })
})
