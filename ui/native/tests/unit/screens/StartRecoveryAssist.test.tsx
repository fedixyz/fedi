import { cleanup, screen, userEvent } from '@testing-library/react-native'

import { setGuardianAssist, setupStore } from '@fedi/common/redux'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'

import i18n from '../../../localization/i18n'
import StartRecoveryAssist from '../../../screens/StartRecoveryAssist'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('/screens/StartRecoveryAssist', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()
    let mockFedimint: MockFedimintBridge
    const mockSetGuardianPassword = Promise.resolve()

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()

        mockFedimint = createMockFedimintBridge({
            setGuardianPassword: mockSetGuardianPassword,
        })
    })

    afterEach(() => {
        cleanup()
    })
    describe('When the screen loads', () => {
        it('should render the correct text and button', async () => {
            renderWithProviders(
                <StartRecoveryAssist
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                },
            )

            const title = screen.getByText(
                i18n.t('feature.recovery.recovery-assist-title'),
            )
            const subTitle = screen.getByText(
                i18n.t('feature.recovery.recovery-assist-subtitle'),
            )

            expect(title).toBeOnTheScreen()
            expect(subTitle).toBeOnTheScreen()
        })
    })

    describe('When there is not an authenticated Guardian', () => {
        describe('When the continue button is pressed', () => {
            it('should not call navigate', async () => {
                const navigateSpy = jest.spyOn(mockNavigation, 'navigate')

                renderWithProviders(
                    <StartRecoveryAssist
                        navigation={mockNavigation as any}
                        route={mockRoute as any}
                    />,
                    {
                        store,
                    },
                )

                const continueButton = screen.getByText(
                    i18n.t('words.continue'),
                )
                await user.press(continueButton)

                expect(navigateSpy).not.toHaveBeenCalled()
            })
        })
    })

    describe('When there is a an authenticated Guardian', () => {
        describe('When the continue button is pressed', () => {
            beforeEach(() => {
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

            it('should call navigate', async () => {
                const navigateSpy = jest.spyOn(mockNavigation, 'navigate')

                renderWithProviders(
                    <StartRecoveryAssist
                        navigation={mockNavigation as any}
                        route={mockRoute as any}
                    />,
                    {
                        store,
                    },
                )

                const continueButton = screen.getByText(
                    i18n.t('words.continue'),
                )
                await user.press(continueButton)

                expect(navigateSpy).toHaveBeenCalled()
            })
        })
    })
})
