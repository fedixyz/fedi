import { cleanup, screen, userEvent } from '@testing-library/react-native'

import { setGuardianAssist, setupStore } from '@fedi/common/redux'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'

import i18n from '../../../localization/i18n'
import CompleteRecoveryAssist from '../../../screens/CompleteRecoveryAssist'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockDispatchResponse = jest
    .fn()
    .mockResolvedValue({ meta: { requestStatus: 'fulfilled' } })
const mockDispatch = jest.fn(mockDispatchResponse)

jest.mock('../../../state/hooks', () => ({
    ...jest.requireActual('../../../state/hooks'),
    useAppDispatch: () => mockDispatch,
}))

describe('/screens/CompleteRecoveryAssist', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()
    let mockFedimint: MockFedimintBridge

    const mockSetGuardianPassword = Promise.resolve()
    const mockGetGuardianPassword = Promise.resolve('password')
    const mockApproveSocialRecoveryRequest = Promise.resolve()

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()

        mockFedimint = createMockFedimintBridge({
            setGuardianPassword: mockSetGuardianPassword,
            getGuardianPassword: mockGetGuardianPassword,
            approveSocialRecoveryRequest: mockApproveSocialRecoveryRequest,
        })

        store.dispatch(
            setGuardianAssist({
                fedimint: mockFedimint,
                federationId: '1',
                peerId: 1,
                name: 'name',
                url: 'url',
                password: 'password',
            }),
        )
    })

    afterEach(() => {
        cleanup()
    })

    describe('When the screen loads', () => {
        it('should render the text, video and buttons', async () => {
            renderWithProviders(
                <CompleteRecoveryAssist
                    navigation={mockNavigation as any}
                    route={
                        {
                            params: {
                                videoPath: 'path/to/video',
                                recoveryId: '12345',
                            },
                        } as any
                    }
                />,
                {
                    store,
                },
            )

            const title = screen.getByText(
                i18n.t('feature.recovery.recovery-assist-confirm-title'),
            )

            const subTitle = screen.getByText(
                i18n.t('feature.recovery.recovery-assist-confirm-question'),
            )

            const video = screen.getByTestId('video-container')

            const confirmButton = screen.getByText(i18n.t('words.confirm'))
            const rejectButton = screen.getByText(i18n.t('words.reject'))

            expect(title).toBeOnTheScreen()
            expect(subTitle).toBeOnTheScreen()
            expect(video).toBeOnTheScreen()
            expect(confirmButton).toBeOnTheScreen()
            expect(rejectButton).toBeOnTheScreen()
        })
    })

    describe('When the user long presses the reject button', () => {
        it('should call the navigation replace function', async () => {
            renderWithProviders(
                <CompleteRecoveryAssist
                    navigation={mockNavigation as any}
                    route={
                        {
                            params: {
                                videoPath: 'path/to/video',
                                recoveryId: '12345',
                            },
                        } as any
                    }
                />,
                {
                    store,
                },
            )

            const rejectButton = screen.getByText(i18n.t('words.reject'))
            await user.longPress(rejectButton)

            expect(mockNavigation.replace).toHaveBeenCalled()
        })
    })

    describe('When the user long presses the confirm button', () => {
        it('should dispatch approveSocialRecoveryRequest and call the navigation replace function', async () => {
            renderWithProviders(
                <CompleteRecoveryAssist
                    navigation={mockNavigation as any}
                    route={
                        {
                            params: {
                                videoPath: 'path/to/video',
                                recoveryId: '12345',
                            },
                        } as any
                    }
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            const confirmButton = screen.getByText(i18n.t('words.confirm'))
            await user.longPress(confirmButton)

            expect(mockDispatch).toHaveBeenCalled()
            expect(mockNavigation.replace).toHaveBeenCalled()
        })
    })
})
