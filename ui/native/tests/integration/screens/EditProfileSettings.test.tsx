/* Integration test example for native
 * This test suite serves as an example of how to use the TestBuilder
 * Feel free to add more tests
 */
import { screen, waitFor } from '@testing-library/react-native'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import EditProfileSettings from '../../../screens/EditProfileSettings'
import { renderWithBridge } from '../../utils/render'

describe('/screens/EditProfileSettings', () => {
    // Need to pass a waitFor override to the test builder
    const builder = createIntegrationTestBuilder(waitFor)
    const context = builder.getContext()

    describe('when the display name is set in the input box', () => {
        it('should consist of two random words', async () => {
            await builder.withOnboardingCompleted()

            const {
                bridge: { fedimint },
                store,
            } = context

            renderWithBridge(<EditProfileSettings />, { store, fedimint })

            const input = await screen.getByTestId('DisplayNameInput')

            const words = input.props.value.split(' ')
            expect(words.length).toBe(2)
        })
    })
})
