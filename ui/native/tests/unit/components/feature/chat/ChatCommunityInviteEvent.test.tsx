import { cleanup, fireEvent, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Keyboard, Pressable } from 'react-native'

import { selectSelectedChatMessage, setupStore } from '@fedi/common/redux'
import { createMockCommunityInviteEvent } from '@fedi/common/tests/mock-data/matrix-event'

import ChatCommunityInviteEvent from '../../../../../components/feature/chat/ChatCommunityInviteEvent'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('@fedi/common/hooks/federation', () => ({
    useCommunityInviteCode: jest.fn(() => ({
        joined: false,
        isJoining: false,
        isFetching: false,
        preview: {
            id: 'test-community-id',
            name: 'Test Community',
            meta: {},
            inviteCode: 'fedi:community:test-community-invite-code',
        },
        handleJoin: jest.fn(),
    })),
}))

describe('ChatCommunityInviteEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should dismiss the keyboard before selecting the community invite on long press', async () => {
        const store = setupStore()
        const event = createMockCommunityInviteEvent()
        const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss')

        const { UNSAFE_getByType } = renderWithProviders(
            <ChatCommunityInviteEvent event={event} />,
            { store },
        )

        fireEvent(UNSAFE_getByType(Pressable), 'onLongPress')

        expect(dismissKeyboard).toHaveBeenCalled()
        await waitFor(() => {
            expect(selectSelectedChatMessage(store.getState())).toEqual(event)
        })
    })
})
