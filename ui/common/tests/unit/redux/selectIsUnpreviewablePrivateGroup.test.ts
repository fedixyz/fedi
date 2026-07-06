import {
    setupStore,
    selectIsUnpreviewablePrivateGroup,
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'

import { MOCK_MATRIX_ROOM } from '../../mock-data/matrix'

const ROOM_ID = '!default-chat:test.server'
const COMMUNITY_ID = 'test-community'

// Seeds the cached default-chat preview (federation.defaultCommunityChats) and,
// optionally, the live room membership that supersedes it once the user acts.
function makeStore(
    previewOverrides: Partial<MatrixRoom> = {},
    liveRoomState?: MatrixRoom['roomState'],
) {
    const base = setupStore().getState()
    const store = setupStore({
        ...base,
        federation: {
            ...base.federation,
            defaultCommunityChats: {
                [COMMUNITY_ID]: [
                    {
                        ...MOCK_MATRIX_ROOM,
                        id: ROOM_ID,
                        allowKnocking: true,
                        isPublic: false,
                        preview: null,
                        roomState: 'invited',
                        ...previewOverrides,
                    },
                ],
            },
        },
    })
    if (liveRoomState) {
        store.dispatch(
            addMatrixRoomInfo({
                ...MOCK_MATRIX_ROOM,
                id: ROOM_ID,
                roomState: liveRoomState,
                isPreview: false,
            }),
        )
        store.dispatch(
            handleMatrixRoomListStreamUpdates([
                {
                    Append: {
                        values: [{ status: 'ready' as const, id: ROOM_ID }],
                    },
                },
            ]),
        )
    }
    return store
}

describe('selectIsUnpreviewablePrivateGroup', () => {
    it('is true for a knockable unpreviewable chat the user has not acted on', () => {
        const store = makeStore()

        expect(
            selectIsUnpreviewablePrivateGroup(store.getState(), ROOM_ID),
        ).toBe(true)
    })

    it('stays true while a knock is pending, since the user still cannot see the room', () => {
        const store = makeStore({}, 'knocked')

        expect(
            selectIsUnpreviewablePrivateGroup(store.getState(), ROOM_ID),
        ).toBe(true)
    })

    it('is false once the user has joined, since the real room takes over', () => {
        const store = makeStore({}, 'joined')

        expect(
            selectIsUnpreviewablePrivateGroup(store.getState(), ROOM_ID),
        ).toBe(false)
    })

    it('is false when the homeserver gave us a preview to show', () => {
        const store = makeStore({
            preview: {
                id: '$event',
                roomId: ROOM_ID,
            } as unknown as NonNullable<MatrixRoom['preview']>,
        })

        expect(
            selectIsUnpreviewablePrivateGroup(store.getState(), ROOM_ID),
        ).toBe(false)
    })

    it('is false for a public chat, which anyone can preview', () => {
        const store = makeStore({ allowKnocking: false, isPublic: true })

        expect(
            selectIsUnpreviewablePrivateGroup(store.getState(), ROOM_ID),
        ).toBe(false)
    })

    it('is false for a room that is not a default chat', () => {
        const store = setupStore()

        expect(
            selectIsUnpreviewablePrivateGroup(store.getState(), ROOM_ID),
        ).toBe(false)
    })
})
