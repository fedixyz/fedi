import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import EditProfilePage from '../../../pages/settings/edit-profile'
import { AppState, setupStore } from '../../../state/store'
import { renderWithProviders } from '../../../utils/test-utils/render'

const spy = jest.fn()
jest.mock('../../../hooks/store.ts', () => ({
    ...jest.requireActual('../../../hooks/store'),
    useAppDispatch: () => spy,
}))

describe('/pages/settings/edit-profile', () => {
    let store
    let state: AppState
    const user = userEvent.setup()

    beforeAll(() => {
        store = setupStore()
        state = store.getState()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('when the page loads for the first time', () => {
        it('should disable the button', async () => {
            renderWithProviders(<EditProfilePage />, {
                preloadedState: {
                    matrix: {
                        ...state.matrix,
                        auth: {
                            userId: 'user-id',
                            deviceId: 'device-id',
                            displayName: 'test user',
                        },
                    },
                },
            })

            const button = screen.getByRole('button')
            user.click(button)

            expect(spy).not.toHaveBeenCalled()
        })
    })

    describe('when the user types into the input', () => {
        it('should enable the button', async () => {
            renderWithProviders(<EditProfilePage />, {
                preloadedState: {
                    matrix: {
                        ...state.matrix,
                        auth: {
                            userId: 'user-id',
                            deviceId: 'device-id',
                            displayName: 'test user',
                        },
                    },
                },
            })

            const input = screen.getByDisplayValue('test user')
            await user.type(input, 'test')

            const button = screen.getByRole('button')
            user.click(button)

            await waitFor(() => expect(spy).toHaveBeenCalled())
        })
    })
})
