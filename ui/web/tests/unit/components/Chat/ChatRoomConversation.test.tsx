import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import {
    selectGroupPreview,
    selectMatrixRoom,
    setupStore,
} from '@fedi/common/redux'
import { createMockGroupPreview } from '@fedi/common/tests/mock-data/matrix'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { ChatRoomConversation } from '@fedi/web/src/components/Chat/ChatRoomConversation'
import {
    chatConfirmJoinPublicRoomRoute,
    chatRoute,
} from '@fedi/web/src/constants/routes'
import i18n from '@fedi/web/src/localization/i18n'

import { mockUseRouter } from '../../../../jest.setup'
import { renderWithProviders } from '../../../utils/render'

const mockGetRoomPreview = jest.fn()

jest.mock('@fedi/web/src/lib/bridge', () => ({
    fedimint: {
        getMatrixClient: () => ({
            getRoomPreview: mockGetRoomPreview,
        }),
    },
    writeBridgeFile: jest.fn(),
}))

const TEST_ROOM_ID = '!default-room:test.server'

const defaultGroupPreview = createMockGroupPreview({
    id: TEST_ROOM_ID,
    name: 'Default Community Chat',
})

function createStoreWithGroupPreview() {
    const store = setupStore()

    store.dispatch({
        type: 'matrix/previewFederationDefaultChats/fulfilled',
        payload: [defaultGroupPreview],
    })

    return store
}

describe('/components/Chat/ChatRoomConversation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetRoomPreview.mockRejectedValue(new Error('Preview unavailable'))
        mockUseRouter.query = {
            path: ['room', TEST_ROOM_ID],
        }
    })

    it('should render the join group button when a group preview exists but the room is not joined', () => {
        const store = createStoreWithGroupPreview()
        const state = store.getState()

        expect(selectMatrixRoom(state, TEST_ROOM_ID)).toBeUndefined()
        expect(selectGroupPreview(state, TEST_ROOM_ID)).toBeDefined()

        renderWithProviders(<ChatRoomConversation roomId={TEST_ROOM_ID} />, {
            store,
            fedimint: createMockFedimintBridge(),
        })

        expect(
            screen.getByText(i18n.t('feature.chat.join-group')),
        ).toBeInTheDocument()

        fireEvent.click(screen.getByText(i18n.t('feature.chat.join-group')))

        expect(mockUseRouter.push).toHaveBeenCalledWith(
            chatConfirmJoinPublicRoomRoute(TEST_ROOM_ID),
        )
    })

    it('should not render the join group button when a group preview does not exist', async () => {
        renderWithProviders(<ChatRoomConversation roomId={TEST_ROOM_ID} />, {
            fedimint: createMockFedimintBridge(),
        })

        expect(
            screen.queryByText(i18n.t('feature.chat.join-group')),
        ).not.toBeInTheDocument()

        await waitFor(() => {
            expect(mockUseRouter.replace).toHaveBeenCalledWith(chatRoute)
        })
    })
})
