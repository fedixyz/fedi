import { cleanup } from '@testing-library/react-native'
import React from 'react'

import { setupStore } from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import type { Community, MatrixRoom } from '@fedi/common/types'

import CommunityChats from '../../../../../components/feature/home/CommunityChats'
import DefaultChatTile from '../../../../../components/feature/home/DefaultChatTile'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('../../../../../components/feature/home/DefaultChatTile', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require('react')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native')

    return jest.fn(({ room }: { room?: { id?: string } }) =>
        ReactMock.createElement(
            Text,
            { testID: 'default-chat-tile' },
            room?.id ?? 'loading',
        ),
    )
})

const community: Community = {
    id: 'community-id',
    name: 'Community',
    status: 'active',
    communityInvite: {
        type: 'legacy',
        invite_code_str: 'invite-code',
        community_meta_url: 'https://example.com/meta.json',
    },
    meta: {
        default_matrix_rooms: JSON.stringify(['!room-a:example.com']),
    },
}

const makeRoom = (id: string): MatrixRoom => ({
    ...MOCK_MATRIX_ROOM,
    id,
    name: id,
    isPreview: true,
    isPublic: true,
})

describe('CommunityChats', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('does not create placeholder arrays when loaded chats exceed expected chats', () => {
        const baseState = setupStore().getState()
        const store = setupStore({
            ...baseState,
            federation: {
                ...baseState.federation,
                communities: [community],
                lastSelectedCommunityId: community.id,
                defaultCommunityChats: {
                    [community.id]: [
                        makeRoom('!room-a:example.com'),
                        makeRoom('!room-b:example.com'),
                    ],
                },
            },
        })

        expect(() =>
            renderWithProviders(<CommunityChats />, { store }),
        ).not.toThrow()

        expect(DefaultChatTile).toHaveBeenCalledTimes(2)
    })
})
