import * as DocumentPicker from '@react-native-documents/picker'
import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import RNFS from 'react-native-fs'

import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'

import i18n from '../../../localization/i18n'
import LocateSocialRecovery from '../../../screens/LocateSocialRecovery'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

jest.mock('@react-native-documents/picker', () => ({
    pick: jest.fn(),
    types: {
        allFiles: 'allFiles',
    },
}))

jest.mock('react-native-fs', () => ({
    DocumentDirectoryPath: '/mock/documents',
    unlink: jest.fn(),
    copyFile: jest.fn(),
}))

describe('/screens/LocateSocialRecovery', () => {
    const user = userEvent.setup()
    let mockFedimint: MockFedimintBridge
    const mockValidateRecoveryFile = Promise.resolve()

    beforeEach(() => {
        jest.clearAllMocks()

        mockFedimint = createMockFedimintBridge({
            validateRecoveryFile: mockValidateRecoveryFile,
        })
    })

    afterEach(() => {
        cleanup()
    })

    describe('When the screen loads', () => {
        it('should render the correct text and button', async () => {
            renderWithProviders(
                <LocateSocialRecovery
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const title = screen.getByText(
                i18n.t('feature.recovery.locate-social-recovery-title'),
            )
            const subTitle = screen.getByText(
                i18n.t('feature.recovery.locate-social-recovery-instructions'),
            )
            const button = screen.getByText(
                i18n.t('feature.recovery.locate-social-recovery-button-label'),
            )

            expect(title).toBeOnTheScreen()
            expect(subTitle).toBeOnTheScreen()
            expect(button).toBeOnTheScreen()
        })
    })

    describe('When the user presses the button', () => {
        it('should call the handleFileUpload function and show file on screen', async () => {
            const mockedPick = DocumentPicker.pick as jest.Mock

            mockedPick.mockResolvedValue([
                {
                    uri: 'file://backup.fedi',
                    name: 'backup.fedi',
                    type: 'application/octet-stream',
                },
            ])

            renderWithProviders(
                <LocateSocialRecovery
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
            )

            const button = screen.getByText(
                i18n.t('feature.recovery.locate-social-recovery-button-label'),
            )

            await user.press(button)

            expect(mockedPick).toHaveBeenCalledWith({
                type: 'allFiles',
                allowMultiSelection: false,
                allowVirtualFiles: true,
            })

            await waitFor(() => {
                const fileName = screen.getByText('backup.fedi')
                expect(fileName).toBeOnTheScreen()
            })
        })
    })

    describe('When the user presses the button with a file selected', () => {
        it('should call the handleProcessFile function and navigate to CompleteSocialRecovery', async () => {
            const mockedPick = DocumentPicker.pick as jest.Mock

            mockedPick.mockResolvedValue([
                {
                    uri: 'file://backup.fedi',
                    name: 'backup.fedi',
                    type: 'application/octet-stream',
                },
            ])

            const mockedUnlink = jest.mocked(RNFS.unlink)
            const mockedCopyFile = jest.mocked(RNFS.copyFile)
            mockedUnlink.mockResolvedValue(undefined)
            mockedCopyFile.mockResolvedValue(undefined)

            renderWithProviders(
                <LocateSocialRecovery
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    fedimint: mockFedimint,
                },
            )

            const button = screen.getByText(
                i18n.t('feature.recovery.locate-social-recovery-button-label'),
            )

            await user.press(button)

            await waitFor(() => {
                screen.getByText('backup.fedi')
            })

            const submitButton = screen.getByText(i18n.t('words.submit'))
            await user.press(submitButton)

            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'CompleteSocialRecovery',
            )
        })
    })
})
