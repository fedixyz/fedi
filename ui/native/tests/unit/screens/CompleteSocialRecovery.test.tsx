import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'

import i18n from '../../../localization/i18n'
import CompleteSocialRecovery from '../../../screens/CompleteSocialRecovery'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const mockDispatch = jest.fn(() => ({
    unwrap: jest.fn(),
}))

jest.mock('../../../state/hooks', () => ({
    ...jest.requireActual('../../../state/hooks'),
    useAppDispatch: () => mockDispatch,
}))

jest.mock('../../../components/ui/QRScreen', () => {
    return 'QRScreen'
})

jest.mock('../../../state/navigation', () => ({
    ...jest.requireActual('../../../state/navigation'),
    resetAfterSocialRecovery: jest.fn(),
}))

jest.useFakeTimers()

describe('/screens/CompleteSocialRecovery', () => {
    const user = userEvent.setup()
    let mockFedimint: MockFedimintBridge
    const mockRecoveryQr = Promise.resolve('recovery-code')
    const mockSocialRecoveryApprovals = jest.fn()
    beforeEach(() => {
        jest.clearAllMocks()

        mockFedimint = createMockFedimintBridge({
            recoveryQr: mockRecoveryQr,
            socialRecoveryApprovals: mockSocialRecoveryApprovals,
        })
    })

    afterEach(() => {
        jest.clearAllTimers()
        cleanup()
    })

    describe('When the approvals have not been fetched', () => {
        it('should render the loader', async () => {
            mockSocialRecoveryApprovals.mockResolvedValue([])

            renderWithProviders(
                <CompleteSocialRecovery
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    fedimint: mockFedimint,
                },
            )

            await waitFor(() => {
                const loader = screen.getByTestId('loader')
                expect(loader).toBeOnTheScreen()
            })
        })
    })

    describe('When the approvals have been fetched', () => {
        it('should render the correct text and button', async () => {
            mockSocialRecoveryApprovals.mockReturnValue({
                approvals: [
                    {
                        guardianName: 'guardian-1',
                        approved: true,
                    },
                    {
                        guardianName: 'guardian-2',
                        approved: true,
                    },
                    {
                        guardianName: 'guardian-3',
                        approved: true,
                    },
                    {
                        guardianName: 'guardian-4',
                        approved: false,
                    },
                ],
                remaining: 1,
            })

            renderWithProviders(
                <CompleteSocialRecovery
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    fedimint: mockFedimint,
                },
            )

            await waitFor(() => {
                screen.getByTestId('loader')
            })

            // Advance time by 3 seconds to trigger interval
            await act(async () => {
                jest.advanceTimersByTime(3000)
            })

            const title = screen.getByText(
                i18n.t('feature.recovery.complete-social-recovery-title'),
            )

            const subTitle = screen.getByText(
                i18n.t('feature.recovery.complete-social-recovery-description'),
            )

            const guardian1Name = screen.getByText('guardian-1')
            const guardian2Name = screen.getByText('guardian-2')
            const guardian3Name = screen.getByText('guardian-3')
            const guardian4Name = screen.getByText('guardian-4')

            const remaining = screen.getByText('(1 remaining)')

            const button = screen.getByText(
                i18n.t('feature.recovery.complete-social-recovery'),
            )

            expect(title).toBeOnTheScreen()
            expect(subTitle).toBeOnTheScreen()

            expect(guardian1Name).toBeOnTheScreen()
            expect(guardian2Name).toBeOnTheScreen()
            expect(guardian3Name).toBeOnTheScreen()
            expect(guardian4Name).toBeOnTheScreen()

            expect(remaining).toBeOnTheScreen()

            expect(button).toBeDisabled()
        })
    })

    describe('When all approvals are approved', () => {
        it('should enable the button and allow the user to complete social recovery', async () => {
            mockSocialRecoveryApprovals.mockReturnValue({
                approvals: [
                    {
                        guardianName: 'guardian-1',
                        approved: true,
                    },
                    {
                        guardianName: 'guardian-2',
                        approved: true,
                    },
                    {
                        guardianName: 'guardian-3',
                        approved: true,
                    },
                    {
                        guardianName: 'guardian-4',
                        approved: true,
                    },
                ],
                remaining: 0,
            })

            renderWithProviders(
                <CompleteSocialRecovery
                    navigation={mockNavigation as any}
                    route={mockRoute as any}
                />,
                {
                    fedimint: mockFedimint,
                },
            )

            await waitFor(() => {
                screen.getByTestId('loader')
            })

            // Advance time by 3 seconds to trigger interval
            await act(async () => {
                jest.advanceTimersByTime(3000)
            })

            const button = screen.getByText(
                i18n.t('feature.recovery.complete-social-recovery'),
            )

            expect(button).toBeEnabled()
            await user.press(button)

            await act(async () => {
                expect(mockNavigation.dispatch).toHaveBeenCalled()
            })
        })
    })
})
