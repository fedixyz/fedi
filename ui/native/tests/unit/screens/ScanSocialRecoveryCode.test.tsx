import Clipboard from '@react-native-clipboard/clipboard'
import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import { setGuardianAssist, setupStore } from '@fedi/common/redux'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'

import i18n from '../../../localization/i18n'
import ScanSocialRecoveryCode from '../../../screens/ScanSocialRecoveryCode'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockedClipboard = Clipboard as jest.Mocked<typeof Clipboard>

describe('/screens/ScanSocialRecoveryCode', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    let mockFedimint: MockFedimintBridge
    const mockSetGuardianPassword = Promise.resolve()
    const mockGetGuardianPassword = Promise.resolve('password')
    const mockSocialRecoveryDownloadVerificationDoc =
        Promise.resolve('/path/to/file')

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()

        mockFedimint = createMockFedimintBridge({
            setGuardianPassword: mockSetGuardianPassword,
            getGuardianPassword: mockGetGuardianPassword,
            socialRecoveryDownloadVerificationDoc:
                mockSocialRecoveryDownloadVerificationDoc,
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
        it('should render the correct text and button', async () => {
            renderWithProviders(
                <ScanSocialRecoveryCode
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            const title = screen.getByText(
                i18n.t('feature.recovery.recovery-assist-scan-title'),
            )
            const subTitle = screen.getByText(
                i18n.t('feature.recovery.recovery-assist-scan-subtitle'),
            )
            const pasteButton = screen.getByText(
                i18n.t('feature.omni.action-paste'),
            )

            await waitFor(() => {
                expect(title).toBeOnTheScreen()
                expect(subTitle).toBeOnTheScreen()
                expect(pasteButton).toBeOnTheScreen()
            })
        })
    })

    describe('When the user presses the paste button', () => {
        it('should call navigate', async () => {
            const mockRecoveryQrCode =
                'fedimint:recovery:' +
                JSON.stringify({
                    recoveryId:
                        '0258e77b8b2003ae9b387fff434ceaeb30a9c397721cbaf031b71407b93129f165',
                })

            mockedClipboard.getString.mockResolvedValue(mockRecoveryQrCode)

            renderWithProviders(
                <ScanSocialRecoveryCode
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    store,
                    fedimint: mockFedimint,
                },
            )

            const pasteButton = screen.getByText(
                i18n.t('feature.omni.action-paste'),
            )

            await user.press(pasteButton)
            expect(mockNavigation.navigate).toHaveBeenCalled()
        })
    })
})
