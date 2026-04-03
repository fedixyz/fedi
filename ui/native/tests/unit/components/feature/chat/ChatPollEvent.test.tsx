import { cleanup, fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { Pressable } from 'react-native'

import {
    handleMatrixRoomTimelineStreamUpdates,
    selectSelectedChatMessage,
    setMatrixAuth,
    setMatrixRoomMembers,
    setMatrixRoomPowerLevels,
    setupStore,
} from '@fedi/common/redux'
import { MatrixAuth, MatrixEvent, MatrixPowerLevel } from '@fedi/common/types'
import i18n from '@fedi/native/localization/i18n'

import ChatPollEvent from '../../../../../components/feature/chat/ChatPollEvent'
import SelectedMessageOverlay from '../../../../../components/feature/chat/SelectedMessageOverlay'
import { renderWithProviders } from '../../../../utils/render'

const ROOM_ID = '!test-room:example.com'
const POLL_EVENT_ID = '$poll-event-123'
const POLL_CREATOR_ID = '@poll-creator:example.com'
const ROOM_ADMIN_ID = '@room-admin:example.com'
const ROOM_MEMBER_ID = '@room-member:example.com'

function makePollEvent(): MatrixEvent<'m.poll'> {
    return {
        id: POLL_EVENT_ID as any,
        roomId: ROOM_ID,
        timestamp: Date.now(),
        localEcho: false,
        sender: POLL_CREATOR_ID,
        sendState: null,
        inReply: null,
        mentions: null,
        content: {
            msgtype: 'm.poll',
            body: 'Where should we meet?',
            kind: 'disclosed',
            maxSelections: 1,
            answers: [
                {
                    id: 'answer-1',
                    text: 'Lobby',
                },
                {
                    id: 'answer-2',
                    text: 'Courtyard',
                },
            ],
            votes: {},
            endTime: null,
            hasBeenEdited: false,
        },
    }
}

describe('ChatPollEvent', () => {
    function seedRoomState(
        store: ReturnType<typeof setupStore>,
        event: MatrixEvent<'m.poll'>,
        currentUserId: string,
        currentUserPowerLevel: MatrixPowerLevel,
    ) {
        store.dispatch(
            setMatrixAuth({
                userId: currentUserId,
                deviceId: 'device-1',
            } as MatrixAuth),
        )
        store.dispatch(
            setMatrixRoomMembers({
                roomId: ROOM_ID,
                members: [
                    {
                        id: currentUserId,
                        displayName: 'Current User',
                        avatarUrl: undefined,
                        powerLevel: {
                            type: 'int',
                            value: currentUserPowerLevel,
                        },
                        roomId: ROOM_ID,
                        membership: 'join',
                        ignored: false,
                    },
                    {
                        id: POLL_CREATOR_ID,
                        displayName: 'Poll Creator',
                        avatarUrl: undefined,
                        powerLevel: {
                            type: 'int',
                            value: MatrixPowerLevel.Member,
                        },
                        roomId: ROOM_ID,
                        membership: 'join',
                        ignored: false,
                    },
                ],
            }),
        )
        store.dispatch(
            setMatrixRoomPowerLevels({
                roomId: ROOM_ID,
                powerLevels: {
                    state_default: MatrixPowerLevel.Moderator,
                },
            }),
        )
        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: ROOM_ID,
                updates: [{ Clear: {} }, { Append: { values: [event] } }],
            }),
        )
    }

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it("should show the pin message option when an admin long presses someone else's poll", () => {
        const store = setupStore()
        const event = makePollEvent()
        seedRoomState(store, event, ROOM_ADMIN_ID, MatrixPowerLevel.Admin)

        const { UNSAFE_getByType } = renderWithProviders(
            <>
                <ChatPollEvent event={event} />
                <SelectedMessageOverlay />
            </>,
            {
                store,
            },
        )

        fireEvent(UNSAFE_getByType(Pressable), 'onLongPress')

        expect(selectSelectedChatMessage(store.getState())).toEqual(event)
        expect(
            screen.getByText(i18n.t('feature.chat.pin-message')),
        ).toBeOnTheScreen()
    })

    it("should not open the overlay when a regular member long presses someone else's poll", () => {
        const store = setupStore()
        const event = makePollEvent()
        seedRoomState(store, event, ROOM_MEMBER_ID, MatrixPowerLevel.Member)

        const { UNSAFE_getByType } = renderWithProviders(
            <>
                <ChatPollEvent event={event} />
                <SelectedMessageOverlay />
            </>,
            {
                store,
            },
        )

        fireEvent(UNSAFE_getByType(Pressable), 'onLongPress')

        expect(selectSelectedChatMessage(store.getState())).toBe(null)
        expect(
            screen.queryByText(i18n.t('feature.chat.pin-message')),
        ).not.toBeOnTheScreen()
    })
})
