import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'

import { ChatEditRoom } from '../../../../src/components/Chat/ChatEditRoom'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const mockDispatch = jest.fn().mockReturnValue({
    unwrap: jest.fn().mockResolvedValue(undefined),
})
const mockUseAppSelector = jest.fn()

jest.mock('../../../../src/hooks', () => ({
    useAppDispatch: () => mockDispatch,
    useAppSelector: () => mockUseAppSelector(),
}))

describe('/components/Chat/ChatEditRoom', () => {
    let mockFedimint: MockFedimintBridge
    const user = userEvent.setup()

    beforeEach(() => {
        mockFedimint = createMockFedimintBridge()
        mockUseAppSelector.mockReturnValue(MOCK_MATRIX_ROOM)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('when the primary button is clicked', () => {
        it('should do nothing when there is no group name', async () => {
            mockUseAppSelector.mockReturnValue({
                ...MOCK_MATRIX_ROOM,
                name: '',
            })

            renderWithProviders(<ChatEditRoom roomId="1" />, {
                fedimint: mockFedimint,
            })

            const button = screen.getByText(i18n.t('phrases.save-changes'))

            await user.click(button)

            expect(mockDispatch).not.toHaveBeenCalled()
        })

        it('should edit the group name when there is a group name', async () => {
            renderWithProviders(<ChatEditRoom roomId="1" />, {
                fedimint: mockFedimint,
            })

            const button = screen.getByText(i18n.t('phrases.save-changes'))

            await user.click(button)

            expect(mockDispatch).toHaveBeenCalled()
        })
    })
})
