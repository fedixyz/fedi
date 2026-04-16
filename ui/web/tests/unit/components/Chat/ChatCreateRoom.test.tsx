import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useCreateMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'

import { ChatCreateRoom } from '../../../../src/components/Chat/ChatCreateRoom'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

jest.mock('@fedi/common/hooks/matrix')

describe('/components/Chat/ChatCreateRoom', () => {
    let mockFedimint: MockFedimintBridge
    const user = userEvent.setup()

    beforeEach(() => {
        mockFedimint = createMockFedimintBridge()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('when the primary button is clicked', () => {
        it('should do nothing when there is no group name', async () => {
            const handleCreateGroup = jest.fn()

            ;(useCreateMatrixRoom as jest.Mock).mockReturnValue({
                handleCreateGroup,
                groupName: '',
            })

            renderWithProviders(<ChatCreateRoom />, {
                fedimint: mockFedimint,
            })

            const button = screen.getByText(i18n.t('feature.chat.create-group'))
            expect(button).toBeInTheDocument()

            await user.click(button)

            expect(handleCreateGroup).not.toHaveBeenCalled()
        })

        it('should create the group when there is a group name', async () => {
            const handleCreateGroup = jest.fn()

            ;(useCreateMatrixRoom as jest.Mock).mockReturnValue({
                handleCreateGroup,
                groupName: 'test name',
            })

            renderWithProviders(<ChatCreateRoom />, {
                fedimint: mockFedimint,
            })

            const button = screen.getByText(i18n.t('feature.chat.create-group'))
            expect(button).toBeInTheDocument()

            await user.click(button)

            expect(handleCreateGroup).toHaveBeenCalled()
        })
    })
})
