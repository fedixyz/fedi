import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import EditProfilePage from '../../../pages/settings/edit-profile'
import { AppState, setupStore } from '../../../state/store'
import { renderWithProviders } from '../../../utils/test-utils/render'

const onChangeSpy = jest.fn()
const onSubmitSpy = jest.fn()

jest.mock('@fedi/common/hooks/chat', () => ({
    ...jest.requireActual('@fedi/common/hooks/chat'),
    useDisplayNameForm: () => ({
        username: 'test user',
        isDisabled: false,
        isSubmitting: false,
        errorMessage: null,
        handleChangeUsername: () => onChangeSpy(),
        handleSubmitDisplayName: () => onSubmitSpy(),
    }),
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
        it('should set the value of the input to the display name', async () => {
            renderWithProviders(<EditProfilePage />, {
                preloadedState: {
                    matrix: {
                        ...state.matrix,
                        auth: {
                            userId: 'user-id',
                            deviceId: 'device-id',
                            displayName: 'display name',
                        },
                    },
                },
            })

            const input = screen.getByDisplayValue('test user')
            expect(input).toBeInTheDocument()
        })
    })

    describe('when the user types into the input', () => {
        it('should allow the user to submit the value', async () => {
            renderWithProviders(<EditProfilePage />, {
                preloadedState: {
                    matrix: {
                        ...state.matrix,
                        auth: {
                            userId: 'user-id',
                            deviceId: 'device-id',
                            displayName: 'display name',
                        },
                    },
                },
            })

            const input = screen.getByDisplayValue('test user')
            await user.type(input, 'test')

            const button = screen.getByRole('button')
            user.click(button)

            await waitFor(() => expect(onSubmitSpy).toHaveBeenCalled())
        })
    })
})
