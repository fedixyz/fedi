import { Text } from '@rneui/themed'
import { cleanup, fireEvent, screen } from '@testing-library/react-native'
import { View } from 'react-native'

import { renderWithProviders } from '@fedi/native/tests/utils/render'

import CustomOverlay from '../../../../components/ui/CustomOverlay'

describe('components/ui/CustomOverlay', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should not display any of its contents on the screen when closed', async () => {
        renderWithProviders(
            <CustomOverlay
                show={false}
                contents={{
                    title: 'Test Title',
                    headerElement: <Text>Header Element</Text>,
                    url: 'https://fedi.xyz',
                    message: 'This is a test message',
                    body: (
                        <View testID="body-content">
                            <Text>Body Content</Text>
                        </View>
                    ),
                    buttons: [
                        {
                            text: 'Button 1',
                            onPress() {},
                        },
                        {
                            text: 'Button 2',
                            onPress() {},
                        },
                    ],
                }}
            />,
        )

        const title = screen.queryByText('Test Title')
        const headerText = screen.queryByText('Header Element')
        const url = screen.queryByText('https://fedi.xyz')
        const message = screen.queryByText('This is a test message')
        const body = screen.queryByTestId('body-content')
        const button1 = screen.queryByText('Button 1')
        const button2 = screen.queryByText('Button 2')

        expect(title).not.toBeOnTheScreen()
        expect(headerText).not.toBeOnTheScreen()
        expect(url).not.toBeOnTheScreen()
        expect(message).not.toBeOnTheScreen()
        expect(body).not.toBeOnTheScreen()
        expect(button1).not.toBeOnTheScreen()
        expect(button2).not.toBeOnTheScreen()
    })

    it('should display the contents of the overlay when open', async () => {
        renderWithProviders(
            <CustomOverlay
                show
                contents={{
                    title: 'Test Title',
                    headerElement: <Text>Header Element</Text>,
                    url: 'https://fedi.xyz',
                    message: 'This is a test message',
                    body: (
                        <View testID="body-content">
                            <Text>Body Content</Text>
                        </View>
                    ),
                    buttons: [
                        {
                            text: 'Button 1',
                            onPress() {},
                        },
                        {
                            text: 'Button 2',
                            onPress() {},
                        },
                    ],
                }}
            />,
        )

        const title = screen.queryByText('Test Title')
        const headerText = screen.queryByText('Header Element')
        const url = screen.queryByText('https://fedi.xyz')
        const message = screen.queryByText('This is a test message')
        const body = screen.queryByTestId('body-content')
        const button1 = screen.queryByText('Button 1')
        const button2 = screen.queryByText('Button 2')

        expect(title).toBeOnTheScreen()
        expect(headerText).toBeOnTheScreen()
        expect(url).toBeOnTheScreen()
        expect(message).toBeOnTheScreen()
        expect(body).toBeOnTheScreen()
        expect(button1).toBeOnTheScreen()
        expect(button2).toBeOnTheScreen()
    })

    it('pressing the backdrop should call the onBackdropPress prop', async () => {
        const onBackdropPress = jest.fn()

        renderWithProviders(
            <CustomOverlay
                show
                contents={{}}
                onBackdropPress={onBackdropPress}
            />,
        )

        fireEvent.press(screen.getByTestId('RNE__Overlay__backdrop'))
        expect(onBackdropPress).toHaveBeenCalled()
    })

    it('pressing buttons defined in `contents.buttons` should trigger the onPress callbacks', async () => {
        const onButton1Press = jest.fn()
        const onButton2Press = jest.fn()

        renderWithProviders(
            <CustomOverlay
                show
                contents={{
                    buttons: [
                        {
                            text: 'Button 1',
                            onPress: onButton1Press,
                        },
                        {
                            text: 'Button 2',
                            onPress: onButton2Press,
                        },
                    ],
                }}
            />,
        )

        fireEvent.press(screen.getByText('Button 1'))
        expect(onButton1Press).toHaveBeenCalled()

        fireEvent.press(screen.getByText('Button 2'))
        expect(onButton2Press).toHaveBeenCalled()
    })
})
