import { cleanup, screen, userEvent } from '@testing-library/react-native'
import Share from 'react-native-share'

import i18n from '../../../localization/i18n'
import CompleteSocialBackup from '../../../screens/CompleteSocialBackup'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockUnwrap = jest.fn().mockResolvedValue('/mock/path/backup.fedi')
const mockDispatch = jest.fn(() => ({
    unwrap: mockUnwrap,
}))

jest.mock('../../../state/hooks', () => ({
    useAppDispatch: () => mockDispatch,
}))

const mockContextDispatch = jest.fn()
jest.mock('../../../state/contexts/BackupRecoveryContext', () => {
    const actual = jest.requireActual(
        '../../../state/contexts/BackupRecoveryContext',
    )

    return {
        ...actual,
        useBackupRecoveryContext: () => ({
            dispatch: mockContextDispatch,
        }),
    }
})

describe('/screens/CompleteSocialBackup', () => {
    const user = userEvent.setup()

    afterEach(() => {
        jest.restoreAllMocks()
        cleanup()
    })

    describe('When the screen loads', () => {
        it('should render the text and save button', async () => {
            renderWithProviders(
                <CompleteSocialBackup
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const text1 = screen.getByText(
                i18n.t('feature.backup.complete-backup-save-file'),
            )

            const text2 = screen.getByText(
                i18n.t('feature.backup.complete-backup-save-file-help'),
            )

            const saveButton = screen.getByText(
                i18n.t('feature.backup.save-file'),
            )

            expect(text1).toBeOnTheScreen()
            expect(text2).toBeOnTheScreen()
            expect(saveButton).toBeOnTheScreen()
        })
    })

    describe('When the user presses the save button', () => {
        it('should call the createBackup function', async () => {
            jest.spyOn(Share, 'open')

            renderWithProviders(
                <CompleteSocialBackup
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const saveButton = screen.getByText(
                i18n.t('feature.backup.save-file'),
            )

            await user.press(saveButton)
            expect(Share.open).toHaveBeenCalled()
        })
    })

    describe('When the user has shared the file', () => {
        it('should show the continue and save somewhere else buttons', async () => {
            renderWithProviders(
                <CompleteSocialBackup
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const saveButton = screen.getByText(
                i18n.t('feature.backup.save-file'),
            )

            await user.press(saveButton)

            const continueButton = screen.getByText(i18n.t('words.continue'))
            const saveAgainButton = screen.getByText(
                i18n.t('feature.backup.save-your-wallet-backup-file-again'),
            )

            expect(continueButton).toBeOnTheScreen()
            expect(saveAgainButton).toBeOnTheScreen()
        })
    })

    describe('When the user presses the save again function', () => {
        it('should call the createBackup function again', async () => {
            jest.spyOn(Share, 'open')

            renderWithProviders(
                <CompleteSocialBackup
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const saveButton = screen.getByText(
                i18n.t('feature.backup.save-file'),
            )

            await user.press(saveButton)

            const saveAgainButton = screen.getByText(
                i18n.t('feature.backup.save-your-wallet-backup-file-again'),
            )

            await user.press(saveAgainButton)
            expect(Share.open).toHaveBeenCalled()
        })
    })

    describe('When the user presses the continue button', () => {
        it('should dispatch action and call navigate', async () => {
            const navigateSpy = jest.spyOn(mockNavigation, 'navigate')

            jest.spyOn(Share, 'open')

            renderWithProviders(
                <CompleteSocialBackup
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const saveButton = screen.getByText(
                i18n.t('feature.backup.save-file'),
            )

            await user.press(saveButton)

            const continueButton = screen.getByText(i18n.t('words.continue'))
            await user.press(continueButton)

            expect(navigateSpy).toHaveBeenCalled()
            expect(mockContextDispatch).toHaveBeenCalledWith({
                type: 'COMPLETE_SOCIAL_BACKUP',
            })
        })
    })
})
