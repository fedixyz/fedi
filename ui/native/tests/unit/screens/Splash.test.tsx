import { cleanup, screen, userEvent } from '@testing-library/react-native'
import { Linking } from 'react-native'

import { API_ORIGIN } from '@fedi/common/constants/api'
import { DEEPLINK_RESUME_PATH } from '@fedi/common/constants/linking'
import { setRedirectTo, setupStore } from '@fedi/common/redux'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import i18n from '@fedi/native/localization/i18n'

import Splash from '../../../screens/Splash'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockDispatch = jest.fn()
jest.mock('../../../state/hooks', () => ({
    ...jest.requireActual('../../../state/hooks'),
    useAppDispatch: () => mockDispatch,
}))

describe('Splash screen', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()
    let mockFedimint: MockFedimintBridge = createMockFedimintBridge()

    beforeEach(() => {
        jest.clearAllMocks()

        store = setupStore()
        mockFedimint = createMockFedimintBridge({
            completeOnboardingNewSeed: () => Promise.resolve(),
        })

        mockDispatch.mockReturnValue({
            unwrap: () => Promise.resolve('mocked-status'),
        })
        ;(Linking.openURL as jest.Mock).mockResolvedValue(undefined)
    })

    afterEach(() => {
        cleanup()
    })

    describe('when the screen loads', () => {
        it('should render two main buttons and an Ask Fedi button', async () => {
            renderWithProviders(
                <Splash
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const getStartedButton = screen.getByText(
                i18n.t('phrases.get-started'),
            )
            expect(getStartedButton).toBeOnTheScreen()

            const restoreAccessButton = screen.getByText(
                i18n.t('phrases.recover-my-account'),
            )
            expect(restoreAccessButton).toBeOnTheScreen()

            const askFediButton = screen.getByText(
                i18n.t('feature.support.title'),
            )
            expect(askFediButton).toBeOnTheScreen()
        })
    })

    describe('when the user clicks on the Get Started button with no redirectTo', () => {
        it('should ask if they came from a Fedi link', async () => {
            store.dispatch(setRedirectTo(null))

            renderWithProviders(
                <Splash
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            const getStartedButton = screen.getByText(
                i18n.t('phrases.get-started'),
            )

            await user.press(getStartedButton)

            expect(
                await screen.findByText(
                    i18n.t('feature.onboarding.did-you-come-from-fedi-link'),
                ),
            ).toBeOnTheScreen()
            expect(
                mockFedimint.completeOnboardingNewSeed,
            ).not.toHaveBeenCalled()
        })

        it('should open the Fedi link resume page when the user confirms they came from a Fedi link', async () => {
            store.dispatch(setRedirectTo(null))

            renderWithProviders(
                <Splash
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            await user.press(screen.getByText(i18n.t('phrases.get-started')))
            await user.press(await screen.findByText('Yes'))

            expect(mockFedimint.completeOnboardingNewSeed).toHaveBeenCalled()
            expect(Linking.openURL).toHaveBeenCalledWith(
                `${API_ORIGIN}${DEEPLINK_RESUME_PATH}`,
            )
        })

        it('should navigate to the Wallet screen when the user did not come from a Fedi link', async () => {
            store.dispatch(setRedirectTo(null))

            renderWithProviders(
                <Splash
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            await user.press(screen.getByText(i18n.t('phrases.get-started')))
            await user.press(await screen.findByText('No'))

            expect(mockFedimint.completeOnboardingNewSeed).toHaveBeenCalled()
            expect(mockNavigation.reset).toHaveBeenCalledWith({
                index: 0,
                routes: [
                    {
                        name: 'TabsNavigator',
                        params: { initialRouteName: 'Federations' },
                    },
                ],
            })
        })
    })

    describe('when the user clicks on the Get Started button with a redirectTo to a non-TabsNavigator screen', () => {
        it('should navigate to the redirectTo screen', async () => {
            store.dispatch(
                setRedirectTo('https://app.fedi.xyz/link?screen=room&id=123'),
            )

            renderWithProviders(
                <Splash
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            const getStartedButton = screen.getByText(
                i18n.t('phrases.get-started'),
            )

            await user.press(getStartedButton)

            expect(
                screen.queryByText(
                    i18n.t('feature.onboarding.did-you-come-from-fedi-link'),
                ),
            ).toBeNull()
            expect(mockFedimint.completeOnboardingNewSeed).toHaveBeenCalled()
            expect(mockNavigation.dispatch).toHaveBeenCalledWith({
                payload: {
                    index: 1,
                    routes: [
                        {
                            name: 'TabsNavigator',
                            params: {
                                initialRouteName: 'Wallet',
                            },
                        },
                        {
                            name: 'ChatRoomConversation',
                            params: {
                                roomId: '123',
                            },
                        },
                    ],
                },
                type: 'RESET',
            })
        })
    })

    describe('when the user clicks on the Get Started button with an unknown redirectTo', () => {
        it('should fall back to the Wallet screen', async () => {
            store.dispatch(setRedirectTo('fedi://'))

            renderWithProviders(
                <Splash
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            await user.press(screen.getByText(i18n.t('phrases.get-started')))

            expect(
                screen.queryByText(
                    i18n.t('feature.onboarding.did-you-come-from-fedi-link'),
                ),
            ).toBeNull()
            expect(mockFedimint.completeOnboardingNewSeed).toHaveBeenCalled()
            expect(mockNavigation.dispatch).not.toHaveBeenCalled()
            expect(mockNavigation.reset).toHaveBeenCalledWith({
                index: 0,
                routes: [
                    {
                        name: 'TabsNavigator',
                        params: { initialRouteName: 'Federations' },
                    },
                ],
            })
        })
    })

    describe('when the user clicks on the Getting Start with a redirectTo to a TabsNavigator screen', () => {
        it('should navigate to the redirectTo screen', async () => {
            store.dispatch(
                setRedirectTo('https://app.fedi.xyz/link?screen=chat'),
            )

            renderWithProviders(
                <Splash
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            const getStartedButton = screen.getByText(
                i18n.t('phrases.get-started'),
            )

            await user.press(getStartedButton)

            expect(
                screen.queryByText(
                    i18n.t('feature.onboarding.did-you-come-from-fedi-link'),
                ),
            ).toBeNull()
            expect(mockFedimint.completeOnboardingNewSeed).toHaveBeenCalled()
            expect(mockNavigation.dispatch).toHaveBeenCalledWith({
                payload: {
                    index: 0,
                    routes: [
                        {
                            name: 'TabsNavigator',
                            params: {
                                initialRouteName: 'Chat',
                            },
                        },
                    ],
                },
                type: 'RESET',
            })
        })
    })
})
