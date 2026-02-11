import { cleanup, screen, userEvent } from '@testing-library/react-native'
import { Linking } from 'react-native'

import i18n from '../../../localization/i18n'
import StartSocialBackup from '../../../screens/StartSocialBackup'
import * as hooks from '../../../utils/hooks'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('/screens/StartSocialBackup', () => {
    const user = userEvent.setup()

    afterEach(() => {
        jest.restoreAllMocks()
        cleanup()
    })

    describe('When permissions are denied', () => {
        const requestCameraPermissionSpy = jest.fn()
        const requestMicrophonePermissionSpy = jest.fn()

        beforeEach(() => {
            jest.spyOn(hooks, 'useCameraPermission').mockImplementation(() => ({
                cameraPermission: 'denied',
                requestCameraPermission: requestCameraPermissionSpy,
            }))

            jest.spyOn(hooks, 'useMicrophonePermission').mockImplementation(
                () => ({
                    microphonePermission: 'denied',
                    requestMicrophonePermission: requestMicrophonePermissionSpy,
                }),
            )
        })

        it('should render info message', async () => {
            renderWithProviders(
                <StartSocialBackup
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const infoText = screen.getByText(
                i18n.t('feature.backup.start-social-backup-permissions-text'),
            )

            expect(infoText).toBeOnTheScreen()
        })

        it('should call request permissions when the user clicks on the button', async () => {
            renderWithProviders(
                <StartSocialBackup
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const button = screen.getByText(i18n.t('words.start'))
            expect(button).toBeOnTheScreen()
            await user.press(button)

            expect(requestCameraPermissionSpy).toHaveBeenCalled()
            expect(requestMicrophonePermissionSpy).toHaveBeenCalled()
        })
    })

    describe('When permissions are blocked', () => {
        beforeEach(() => {
            jest.spyOn(hooks, 'useCameraPermission').mockImplementation(() => ({
                cameraPermission: 'blocked',
                requestCameraPermission: jest.fn(),
            }))

            jest.spyOn(hooks, 'useMicrophonePermission').mockImplementation(
                () => ({
                    microphonePermission: 'blocked',
                    requestMicrophonePermission: jest.fn(),
                }),
            )
        })

        it('should render info message', async () => {
            renderWithProviders(
                <StartSocialBackup
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const infoText = screen.getByText(
                i18n.t('feature.backup.start-social-backup-permissions-text'),
            )

            expect(infoText).toBeOnTheScreen()
        })

        it('should open settings when the user clicks on the button', async () => {
            ;(Linking as any).openSettings = jest.fn(() => Promise.resolve())
            const settingsSpy = jest.spyOn(Linking, 'openSettings')

            renderWithProviders(
                <StartSocialBackup
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const button = screen.getByText(i18n.t('phrases.open-settings'))
            expect(button).toBeOnTheScreen()
            await user.press(button)

            expect(settingsSpy).toHaveBeenCalled()
        })
    })

    describe('When permissions are granted', () => {
        beforeEach(() => {
            jest.spyOn(hooks, 'useCameraPermission').mockImplementation(() => ({
                cameraPermission: 'granted',
                requestCameraPermission: jest.fn(),
            }))

            jest.spyOn(hooks, 'useMicrophonePermission').mockImplementation(
                () => ({
                    microphonePermission: 'granted',
                    requestMicrophonePermission: jest.fn(),
                }),
            )
        })

        it('should not render info message', async () => {
            renderWithProviders(
                <StartSocialBackup
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const infoText = screen.queryByText(
                i18n.t('feature.backup.start-social-backup-permissions-text'),
            )

            expect(infoText).not.toBeOnTheScreen()
        })

        it('should call navigate when the user clicks on the button', async () => {
            const navigateSpy = jest.spyOn(mockNavigation, 'navigate')

            renderWithProviders(
                <StartSocialBackup
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const button = screen.getByText(i18n.t('words.start'))
            expect(button).toBeOnTheScreen()
            await user.press(button)

            expect(navigateSpy).toHaveBeenCalled()
        })
    })
})
