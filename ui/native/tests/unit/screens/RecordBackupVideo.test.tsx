import { cleanup, screen, userEvent } from '@testing-library/react-native'
import RNFS from 'react-native-fs'

import i18n from '../../../localization/i18n'
import RecordBackupVideo from '../../../screens/RecordBackupVideo'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockState = jest.fn(() => ({
    videoFile: null,
}))

jest.mock('../../../state/contexts/BackupRecoveryContext', () => {
    const actual = jest.requireActual(
        '../../../state/contexts/BackupRecoveryContext',
    )
    return {
        ...actual,
        useBackupRecoveryContext: () => ({
            state: mockState(),
        }),
    }
})

describe('/screens/RecordBackupVideo', () => {
    const user = userEvent.setup()

    afterEach(() => {
        jest.restoreAllMocks()
        cleanup()
    })

    describe('When there is no video file', () => {
        it('should render the text and record button', async () => {
            renderWithProviders(
                <RecordBackupVideo
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const text1 = screen.getByText(
                i18n.t('feature.backup.record-video-tip'),
            )

            const text2 = screen.getByText(
                i18n.t('feature.backup.record-video-prompt'),
            )

            const recordButton = screen.getByTestId('record-btn')

            expect(text1).toBeOnTheScreen()
            expect(text2).toBeOnTheScreen()
            expect(recordButton).toBeOnTheScreen()
        })
    })

    describe('When there is a video file', () => {
        it('should render buttons to record and and confirm', async () => {
            mockState.mockReturnValue({
                videoFile: {
                    path: '/mock/path/backup.fedi',
                } as any,
            })

            renderWithProviders(
                <RecordBackupVideo
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const confirmButton = screen.getByText(
                i18n.t('feature.backup.confirm-backup-video'),
            )

            const recordAgainButton = screen.getByText(
                i18n.t('feature.backup.record-again'),
            )

            expect(confirmButton).toBeOnTheScreen()
            expect(recordAgainButton).toBeOnTheScreen()
        })
    })

    describe('When the user presses the confirm button', () => {
        it('should call save the file', async () => {
            const navigateSpy = jest.spyOn(mockNavigation, 'navigate')

            mockState.mockReturnValue({
                videoFile: {
                    path: '/mock/path/backup.fedi',
                } as any,
            })

            renderWithProviders(
                <RecordBackupVideo
                    navigation={mockNavigation as any}
                    route={{ params: { federationId: '123' } } as any}
                />,
            )

            const confirmButton = screen.getByText(
                i18n.t('feature.backup.confirm-backup-video'),
            )
            await user.press(confirmButton)

            expect(RNFS.exists).toHaveBeenCalledWith('/mock/path/backup.fedi')
            expect(RNFS.copyFile).toHaveBeenCalled()

            expect(navigateSpy).toHaveBeenCalled()
        })
    })
})
