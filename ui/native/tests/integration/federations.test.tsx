/* Integration test example for native
 * This test suite serves as an example of how to use the TestBuilder
 * Feel free to add more tests
 */
import { screen, userEvent, waitFor } from '@testing-library/react-native'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import JoinFederation from '../../screens/JoinFederation'
import PublicFederations from '../../screens/PublicFederations'
import { mockNavigation, mockRoute } from '../setup/jest.setup.mocks'
import { renderWithBridge } from '../utils/render'

describe('federations', () => {
    // Need to pass a waitFor override to the test builder
    const builder = createIntegrationTestBuilder(waitFor)
    const context = builder.getContext()

    describe('JoinFederation screen', () => {
        it('should show the paste federation code button', async () => {
            await builder.withOnboardingCompleted()

            const {
                bridge: { fedimint },
                store,
            } = context

            renderWithBridge(
                <JoinFederation
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                { store, fedimint },
            )

            const pasteFederationCodeButton = await screen.findByText(
                'Paste federation code',
            )
            expect(pasteFederationCodeButton).toBeOnTheScreen()
        })
    })

    describe('PublicFederations screen', () => {
        it('should render all 3 pressable tabs, with the expected action buttons for discover, join, and create', async () => {
            await builder.withOnboardingCompleted()

            const {
                bridge: { fedimint },
                store,
            } = context

            renderWithBridge(
                <PublicFederations
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                { store, fedimint },
            )

            const user = userEvent.setup()

            const discoverTab = await screen.findByTestId('discoverTab')
            const joinTab = await screen.findByTestId('joinTab')
            const createTab = await screen.findByTestId('createTab')
            expect(discoverTab).toBeOnTheScreen()
            expect(joinTab).toBeOnTheScreen()
            expect(createTab).toBeOnTheScreen()

            await waitFor(async () => {
                const joinButtons = await screen.findAllByText('Join')
                expect(joinButtons.length).toBeGreaterThanOrEqual(3)
            })

            await user.press(joinTab)

            await waitFor(async () => {
                const pasteButton = await screen.findByTestId('PasteButton')
                expect(pasteButton).toBeOnTheScreen()
            })

            await user.press(createTab)

            await waitFor(async () => {
                const createButton = await screen.findByText(
                    'Create my Federation',
                )
                expect(createButton).toBeOnTheScreen()
            })
        })
    })
})
