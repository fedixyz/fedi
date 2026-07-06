import {
    setupStore,
    selectChatTileName,
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'

import { MOCK_MATRIX_ROOM } from '../../mock-data/matrix'

const ROOM_ID = '!default-chat:test.server'
const COMMUNITY_ID = 'test-community'

function makeStore(
    previewOverrides: Partial<MatrixRoom> = {},
    liveRoom?: Partial<MatrixRoom>,
) {
    const base = setupStore().getState()
    const store = setupStore({
        ...base,
        federation: {
            ...base.federation,
            defaultCommunityChats: {
                [COMMUNITY_ID]: [
                    { ...MOCK_MATRIX_ROOM, id: ROOM_ID, ...previewOverrides },
                ],
            },
        },
    })
    if (liveRoom) {
        store.dispatch(
            addMatrixRoomInfo({
                ...MOCK_MATRIX_ROOM,
                id: ROOM_ID,
                isPreview: false,
                ...liveRoom,
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

describe('selectChatTileName', () => {
    it('prefers the live room name, so a joined room keeps its real name over an empty placeholder', () => {
        // Preview is the empty-name placeholder, but the user has joined and the
        // live room knows the real name.
        const store = makeStore(
            { name: '' },
            { name: 'Community Chat', roomState: 'joined' },
        )

        expect(selectChatTileName(store.getState(), ROOM_ID)).toBe(
            'Community Chat',
        )
    })

    it('falls back to the preview name when there is no live room', () => {
        const store = makeStore({ name: 'Public Chat' })

        expect(selectChatTileName(store.getState(), ROOM_ID)).toBe(
            'Public Chat',
        )
    })

    it('returns empty for an unnamed placeholder so the caller can label it', () => {
        const store = makeStore({ name: '' })

        expect(selectChatTileName(store.getState(), ROOM_ID)).toBe('')
    })

    it('returns empty for a room it knows nothing about', () => {
        const store = setupStore()

        expect(selectChatTileName(store.getState(), ROOM_ID)).toBe('')
    })
})
