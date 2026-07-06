import { cleanup, fireEvent, screen } from '@testing-library/react-native'
import React from 'react'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockGroupPreview,
    MOCK_MATRIX_ROOM,
} from '@fedi/common/tests/mock-data/matrix'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { Community, MatrixRoom } from '@fedi/common/types'
import { makeUnpreviewableDefaultChat } from '@fedi/common/utils/matrix'
import i18n from '@fedi/native/localization/i18n'

import DefaultChatTile from '../../../../../components/feature/home/DefaultChatTile'
import { mockNavigation } from '../../../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../../../utils/render'

const TEST_ROOM_ID = '!default-chat:test.server'
const TEST_COMMUNITY_ID = 'test-community'
const GLOBAL_COMMUNITY_ID = 'fedi-global-community'

const JOIN = i18n.t('words.join')
const PENDING = i18n.t('words.pending')
const PRIVATE_GROUP = i18n.t('feature.chat.private-group')
const REQUEST_TO_JOIN = i18n.t('feature.chat.request-to-join-group')
const REQUEST_PENDING = i18n.t('feature.chat.request-to-join-pending')
const NO_MESSAGES = i18n.t('feature.chat.no-messages')

const mockJoinRoom = jest.fn()
const mockKnockRoom = jest.fn()

function createFedimint() {
    return createMockFedimintBridge({
        getMatrixClient: () => ({
            joinRoom: mockJoinRoom,
            knockRoom: mockKnockRoom,
        }),
    } as never)
}

function createDefaultChatRoom(
    overrides: Partial<MatrixRoom> = {},
): MatrixRoom {
    return {
        ...MOCK_MATRIX_ROOM,
        id: TEST_ROOM_ID,
        name: 'Community Chat',
        ...overrides,
    }
}

// Seeds the store the way previewCommunityDefaultChats does, so
// selectDefaultMatrixRoom resolves the tile's room.
function createStoreWithDefaultChat(overrides: Partial<MatrixRoom> = {}) {
    const store = setupStore()
    store.dispatch({
        type: 'matrix/previewCommunityDefaultChats/fulfilled',
        payload: [
            createMockGroupPreview({
                id: TEST_ROOM_ID,
                name: 'Community Chat',
                ...overrides,
            }),
        ],
        meta: { arg: { communityId: TEST_COMMUNITY_ID } },
    })
    return store
}

function addMembership(
    store: ReturnType<typeof setupStore>,
    roomState: MatrixRoom['roomState'],
    overrides: Partial<MatrixRoom> = {},
) {
    store.dispatch(
        addMatrixRoomInfo(
            createDefaultChatRoom({
                roomState,
                isPreview: false,
                ...overrides,
            }),
        ),
    )
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            {
                Append: {
                    values: [{ status: 'ready' as const, id: TEST_ROOM_ID }],
                },
            },
        ]),
    )
}

describe('/components/feature/home/DefaultChatTile', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockJoinRoom.mockResolvedValue(undefined)
        mockKnockRoom.mockResolvedValue(undefined)
    })

    afterEach(() => {
        cleanup()
    })

    it('opens the room preview from the Join button for a public chat', () => {
        const onSelect = jest.fn()
        renderWithProviders(
            <DefaultChatTile
                room={createDefaultChatRoom()}
                onSelect={onSelect}
            />,
            {
                store: createStoreWithDefaultChat({ isPublic: true }),
                fedimint: createFedimint(),
            },
        )

        fireEvent.press(screen.getByText(JOIN))

        // The tile must not join in place; it opens the same preview screen
        // the invite scanner uses, where the user sees the room and confirms.
        expect(mockNavigation.navigate).toHaveBeenCalledWith('RoomLink', {
            roomId: TEST_ROOM_ID,
        })
        expect(mockJoinRoom).not.toHaveBeenCalled()
        expect(mockKnockRoom).not.toHaveBeenCalled()
        // The Join tap must not also fire the row's onSelect.
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('opens the room preview from the Join button for a knockable chat', () => {
        renderWithProviders(
            <DefaultChatTile room={createDefaultChatRoom()} />,
            {
                store: createStoreWithDefaultChat({
                    isPublic: false,
                    allowKnocking: true,
                }),
                fedimint: createFedimint(),
            },
        )

        fireEvent.press(screen.getByText(JOIN))

        // A knockable room must not knock straight from the tile either; the
        // preview screen is where the knock is confirmed.
        expect(mockNavigation.navigate).toHaveBeenCalledWith('RoomLink', {
            roomId: TEST_ROOM_ID,
        })
        expect(mockKnockRoom).not.toHaveBeenCalled()
        expect(mockJoinRoom).not.toHaveBeenCalled()
    })

    it('reads as a private group to request to join when it cannot be previewed', () => {
        const store = setupStore()
        // The real fallback the thunk stores when the homeserver gives back no
        // name and no messages for a knockable room.
        store.dispatch({
            type: 'matrix/previewCommunityDefaultChats/fulfilled',
            payload: [makeUnpreviewableDefaultChat(TEST_ROOM_ID)],
            meta: { arg: { communityId: TEST_COMMUNITY_ID } },
        })

        renderWithProviders(
            <DefaultChatTile room={createDefaultChatRoom({ name: '' })} />,
            {
                store,
                fedimint: createFedimint(),
            },
        )

        // "New group" and "No messages yet" would both be lies here, so the
        // tile names it a private group and tells the user to request to join.
        expect(screen.getByText(PRIVATE_GROUP)).toBeOnTheScreen()
        expect(screen.getByText(REQUEST_TO_JOIN)).toBeOnTheScreen()
        // It still offers Join, which opens the confirm screen to knock.
        expect(screen.getByText(JOIN)).toBeOnTheScreen()
    })

    it('shows the request as pending, not "request to join", once the user has knocked on an unpreviewable group', () => {
        const store = setupStore()
        // The cached preview stays frozen at its unpreviewable state...
        store.dispatch({
            type: 'matrix/previewCommunityDefaultChats/fulfilled',
            payload: [makeUnpreviewableDefaultChat(TEST_ROOM_ID)],
            meta: { arg: { communityId: TEST_COMMUNITY_ID } },
        })
        // ...while the live room reflects the knock. A knock grants no read
        // access, so the room still has no name to show.
        addMembership(store, 'knocked', { name: '' })

        renderWithProviders(
            <DefaultChatTile room={createDefaultChatRoom({ name: '' })} />,
            {
                store,
                fedimint: createFedimint(),
            },
        )

        // Still a private group, but the subtitle and button must reflect the
        // pending knock, never tell the user to request again.
        expect(screen.getByText(PRIVATE_GROUP)).toBeOnTheScreen()
        expect(screen.getByText(REQUEST_PENDING)).toBeOnTheScreen()
        expect(screen.queryByText(REQUEST_TO_JOIN)).toBeNull()
        expect(screen.getByText(PENDING)).toBeOnTheScreen()
        expect(screen.queryByText(JOIN)).toBeNull()
    })

    it('does not flip a joined room into a knockable tile when its preview fails', () => {
        const store = setupStore()
        // Offline (or any preview failure): the store holds only the empty-name
        // knockable placeholder for a room the user is actually joined to.
        store.dispatch({
            type: 'matrix/previewCommunityDefaultChats/fulfilled',
            payload: [makeUnpreviewableDefaultChat(TEST_ROOM_ID)],
            meta: { arg: { communityId: TEST_COMMUNITY_ID } },
        })
        addMembership(store, 'joined')

        // Rendered with the placeholder prop (name ''), exactly as the Spaces
        // screen passes it.
        renderWithProviders(
            <DefaultChatTile room={createDefaultChatRoom({ name: '' })} />,
            {
                store,
                fedimint: createFedimint(),
            },
        )

        // Live membership wins over the knockable placeholder: no knock
        // affordance, never relabeled "Private group", and the real room name
        // shows rather than a generic fallback.
        expect(screen.queryByText(JOIN)).toBeNull()
        expect(screen.queryByText(PENDING)).toBeNull()
        expect(screen.queryByText(REQUEST_TO_JOIN)).toBeNull()
        expect(screen.queryByText(PRIVATE_GROUP)).toBeNull()
        expect(screen.getByText('Community Chat')).toBeOnTheScreen()
    })

    it('never shows "No messages yet" on a preview we could not fetch', () => {
        const store = setupStore()
        // A public default chat whose messages the homeserver didn't return:
        // empty timeline, no preview. We can't know it's actually empty.
        store.dispatch({
            type: 'matrix/previewCommunityDefaultChats/fulfilled',
            payload: [
                {
                    info: {
                        ...MOCK_MATRIX_ROOM,
                        id: TEST_ROOM_ID,
                        name: 'Public Chat',
                        isPublic: true,
                        allowKnocking: false,
                        isPreview: true,
                        roomState: 'invited',
                        preview: null,
                    },
                    timeline: [],
                    isDefaultGroup: true,
                },
            ],
            meta: { arg: { communityId: TEST_COMMUNITY_ID } },
        })

        renderWithProviders(
            <DefaultChatTile
                room={createDefaultChatRoom({
                    name: 'Public Chat',
                    isPublic: true,
                })}
            />,
            {
                store,
                fedimint: createFedimint(),
            },
        )

        // The misleading subtitle must never render. A blank one is fine.
        expect(screen.queryByText(NO_MESSAGES)).toBeNull()
        // The tile is still there and joinable.
        expect(screen.getByText(JOIN)).toBeOnTheScreen()
    })

    it('shows Pending for a chat the user already knocked on', () => {
        const store = createStoreWithDefaultChat({
            isPublic: false,
            allowKnocking: true,
        })
        addMembership(store, 'knocked')

        renderWithProviders(
            <DefaultChatTile room={createDefaultChatRoom()} />,
            {
                store,
                fedimint: createFedimint(),
            },
        )

        expect(screen.getByText(PENDING)).toBeOnTheScreen()
        expect(screen.queryByText(JOIN)).toBeNull()
    })

    it('shows neither button once the user has joined', () => {
        const store = createStoreWithDefaultChat({ isPublic: true })
        addMembership(store, 'joined')

        renderWithProviders(
            <DefaultChatTile room={createDefaultChatRoom()} />,
            {
                store,
                fedimint: createFedimint(),
            },
        )

        expect(screen.queryByText(JOIN)).toBeNull()
        expect(screen.queryByText(PENDING)).toBeNull()
    })

    it('never offers to join a Fedi Global community chat', () => {
        const baseState = setupStore().getState()
        const globalCommunity: Community = {
            id: GLOBAL_COMMUNITY_ID,
            name: 'Fedi Global',
            status: 'active',
            communityInvite: {
                type: 'legacy',
                invite_code_str: GLOBAL_COMMUNITY_ID,
                community_meta_url: 'https://example.com/meta.json',
            },
            meta: {
                default_matrix_rooms: JSON.stringify([TEST_ROOM_ID]),
            },
        }
        const store = setupStore({
            ...baseState,
            environment: {
                ...baseState.environment,
                featureFlags: {
                    global_community: { invite_code: GLOBAL_COMMUNITY_ID },
                } as unknown as typeof baseState.environment.featureFlags,
            },
            federation: {
                ...baseState.federation,
                communities: [globalCommunity],
                defaultCommunityChats: {
                    [GLOBAL_COMMUNITY_ID]: [
                        createDefaultChatRoom({
                            isPublic: true,
                            isPreview: true,
                        }),
                    ],
                },
            },
        })

        renderWithProviders(
            <DefaultChatTile room={createDefaultChatRoom()} />,
            {
                store,
                fedimint: createFedimint(),
            },
        )

        // A public chat would normally show Join. The global-community
        // exception suppresses it.
        expect(screen.queryByText(JOIN)).toBeNull()
        expect(screen.queryByText(PENDING)).toBeNull()
    })
})
