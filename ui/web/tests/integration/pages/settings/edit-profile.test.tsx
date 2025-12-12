import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import EditProfilePage from '../../../../src/pages/settings/edit-profile'
import { renderWithBridge } from '../../../utils/render'

describe('/pages/settings/edit-profile', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    describe('when the display name is set as the value in the input box', () => {
        it('should consist of two random words', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            renderWithBridge(<EditProfilePage />, { store, fedimint })

            await waitFor(
                async () => {
                    const input =
                        await screen.getByLabelText<HTMLInputElement>(
                            /display name/i,
                        )
                    const words = input.value.split(' ')
                    expect(words.length).toBe(2)
                },
                { timeout: 5000 },
            )
        })
    })
})
