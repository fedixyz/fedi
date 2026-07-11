import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import { usePendingJoinRequests } from '@fedi/common/hooks/matrix'
import { setupStore } from '@fedi/common/redux'
import { MatrixRoomMember } from '@fedi/common/types'
import { ChatRoomMembersList } from '@fedi/web/src/components/Chat/ChatRoomMembersList'
import i18n from '@fedi/web/src/localization/i18n'

import { renderWithProviders } from '../../../utils/render'

const TEST_ROOM_ID = '!members-list:test.server'

// The pending tab is admin/mod only and reads knocking members off the bridge,
// so we mock the shared hook to isolate the initialTab wiring under test.
jest.mock('@fedi/common/hooks/matrix', () => ({
    ...jest.requireActual('@fedi/common/hooks/matrix'),
    usePendingJoinRequests: jest.fn(),
}))

const mockUsePendingJoinRequests = usePendingJoinRequests as jest.Mock

const PENDING_MEMBER: MatrixRoomMember = {
    id: '@knocker:test.server',
    displayName: 'Knocker Kim',
    roomId: TEST_ROOM_ID,
    powerLevel: { type: 'int', value: 0 },
    membership: 'knock',
    ignored: false,
}

describe('/components/Chat/ChatRoomMembersList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUsePendingJoinRequests.mockReturnValue({
            canRespond: true,
            pendingMembers: [PENDING_MEMBER],
            pendingCount: 1,
            processingUserId: null,
            markSeen: jest.fn(),
            accept: jest.fn(),
            decline: jest.fn(),
        })
    })

    it('opens on the pending tab when initialTab is "pending"', () => {
        renderWithProviders(
            <ChatRoomMembersList roomId={TEST_ROOM_ID} initialTab="pending" />,
            { store: setupStore() },
        )

        expect(screen.getByText('Knocker Kim')).toBeInTheDocument()
        expect(
            screen.getByText(i18n.t('feature.chat.requested-to-join')),
        ).toBeInTheDocument()
    })

    it('defaults to the members tab when no initialTab is given', () => {
        renderWithProviders(<ChatRoomMembersList roomId={TEST_ROOM_ID} />, {
            store: setupStore(),
        })

        // members tab is active, so the pending request is not shown
        expect(screen.queryByText('Knocker Kim')).not.toBeInTheDocument()
        expect(
            screen.getByText(i18n.t('feature.chat.no-one-is-in-this-group')),
        ).toBeInTheDocument()
    })
})
