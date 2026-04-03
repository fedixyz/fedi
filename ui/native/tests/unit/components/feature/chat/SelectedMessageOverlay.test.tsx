import { cleanup, screen } from '@testing-library/react-native'
import React from 'react'

import {
    handleMatrixRoomTimelineStreamUpdates,
    setMatrixAuth,
    setMatrixRoomMembers,
    setMatrixRoomPowerLevels,
    setSelectedChatMessage,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockNonPaymentEvent,
    mockMatrixEventImage,
} from '@fedi/common/tests/mock-data/matrix-event'
import {
    MatrixAuth,
    MatrixEvent,
    MatrixPowerLevel,
    MatrixRoomMember,
} from '@fedi/common/types'
import i18n from '@fedi/native/localization/i18n'

import SelectedMessageOverlay from '../../../../../components/feature/chat/SelectedMessageOverlay'
import { renderWithProviders } from '../../../../utils/render'

const ROOM_ID = '!overlay-room:example.com'
const OWNER_ID = '@owner:example.com'
const ADMIN_ID = '@admin:example.com'
const MEMBER_ID = '@member:example.com'

const ACTION_LABELS = {
    reply: i18n.t('words.reply'),
    copy: i18n.t('phrases.copy-text'),
    edit: i18n.t('words.edit'),
    pin: i18n.t('feature.chat.pin-message'),
    download: i18n.t('words.download'),
    delete: i18n.t('words.delete'),
}

jest.mock('../../../../../utils/hooks/media', () => ({
    useDownloadResource: jest.fn(() => ({
        handleDownload: jest.fn(),
        isDownloading: false,
    })),
}))

function makeTextEvent(
    overrides: Partial<MatrixEvent<'m.text'>> = {},
): MatrixEvent<'m.text'> {
    return createMockNonPaymentEvent({
        id: '$text-event' as any,
        roomId: ROOM_ID,
        sender: OWNER_ID,
        ...(overrides as any),
    })
}

function makeNoticeEvent(): MatrixEvent<'m.notice'> {
    return {
        ...makeTextEvent({
            id: '$notice-event' as any,
        }),
        content: {
            msgtype: 'm.notice',
            body: 'Notice message',
            formatted: null,
        },
    }
}

function makeImageEvent(): MatrixEvent<'m.image'> {
    return {
        ...mockMatrixEventImage,
        id: '$image-event' as any,
        roomId: ROOM_ID,
        sender: OWNER_ID,
    }
}

function makePollEvent(): MatrixEvent<'m.poll'> {
    return {
        id: '$poll-event' as any,
        roomId: ROOM_ID,
        timestamp: Date.now(),
        localEcho: false,
        sender: OWNER_ID,
        sendState: null,
        inReply: null,
        mentions: null,
        content: {
            msgtype: 'm.poll',
            body: 'Choose an option',
            kind: 'disclosed',
            maxSelections: 1,
            answers: [
                { id: 'answer-1', text: 'One' },
                { id: 'answer-2', text: 'Two' },
            ],
            votes: {},
            endTime: null,
            hasBeenEdited: false,
        },
    }
}

function seedOverlayState({
    event,
    currentUserId,
    currentUserPowerLevel,
}: {
    event: MatrixEvent
    currentUserId: string
    currentUserPowerLevel: MatrixPowerLevel
}) {
    const store = setupStore()
    const members: MatrixRoomMember[] = [
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
    ]

    if (event.sender !== currentUserId) {
        members.push({
            id: event.sender,
            displayName: 'Event Sender',
            avatarUrl: undefined,
            powerLevel: {
                type: 'int',
                value: MatrixPowerLevel.Member,
            },
            roomId: ROOM_ID,
            membership: 'join',
            ignored: false,
        })
    }

    store.dispatch(
        setMatrixAuth({
            userId: currentUserId,
            deviceId: 'device-1',
        } as MatrixAuth),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members,
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
    store.dispatch(setSelectedChatMessage(event as any))

    return store
}

function renderOverlayScenario(args: {
    event: MatrixEvent
    currentUserId: string
    currentUserPowerLevel: MatrixPowerLevel
}) {
    const store = seedOverlayState(args)
    renderWithProviders(<SelectedMessageOverlay />, { store })
    return store
}

function expectOnlyActions(visibleActions: Array<string>) {
    const allActions = Object.values(ACTION_LABELS)

    for (const action of allActions) {
        if (visibleActions.includes(action)) {
            expect(screen.getByText(action)).toBeOnTheScreen()
        } else {
            expect(screen.queryByText(action)).not.toBeOnTheScreen()
        }
    }
}

describe('SelectedMessageOverlay', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should show reply, copy, edit, and delete for your own text message', () => {
        renderOverlayScenario({
            event: makeTextEvent(),
            currentUserId: OWNER_ID,
            currentUserPowerLevel: MatrixPowerLevel.Member,
        })

        expectOnlyActions([
            ACTION_LABELS.reply,
            ACTION_LABELS.copy,
            ACTION_LABELS.edit,
            ACTION_LABELS.delete,
        ])
    })

    it("should show reply and copy for another member's text message", () => {
        renderOverlayScenario({
            event: makeTextEvent(),
            currentUserId: MEMBER_ID,
            currentUserPowerLevel: MatrixPowerLevel.Member,
        })

        expectOnlyActions([ACTION_LABELS.reply, ACTION_LABELS.copy])
    })

    it("should show reply, copy, pin, and delete for an admin on someone else's text message", () => {
        renderOverlayScenario({
            event: makeTextEvent(),
            currentUserId: ADMIN_ID,
            currentUserPowerLevel: MatrixPowerLevel.Admin,
        })

        expectOnlyActions([
            ACTION_LABELS.reply,
            ACTION_LABELS.copy,
            ACTION_LABELS.pin,
            ACTION_LABELS.delete,
        ])
    })

    it('should show reply and delete for your own notice message', () => {
        renderOverlayScenario({
            event: makeNoticeEvent(),
            currentUserId: OWNER_ID,
            currentUserPowerLevel: MatrixPowerLevel.Member,
        })

        expectOnlyActions([ACTION_LABELS.reply, ACTION_LABELS.delete])
    })

    it('should show reply and download for another member image message', () => {
        renderOverlayScenario({
            event: makeImageEvent(),
            currentUserId: MEMBER_ID,
            currentUserPowerLevel: MatrixPowerLevel.Member,
        })

        expectOnlyActions([ACTION_LABELS.reply, ACTION_LABELS.download])
    })

    it("should show reply, download, pin, and delete for an admin on someone else's image message", () => {
        renderOverlayScenario({
            event: makeImageEvent(),
            currentUserId: ADMIN_ID,
            currentUserPowerLevel: MatrixPowerLevel.Admin,
        })

        expectOnlyActions([
            ACTION_LABELS.reply,
            ACTION_LABELS.download,
            ACTION_LABELS.pin,
            ACTION_LABELS.delete,
        ])
    })

    it('should show delete only for your own poll', () => {
        renderOverlayScenario({
            event: makePollEvent(),
            currentUserId: OWNER_ID,
            currentUserPowerLevel: MatrixPowerLevel.Member,
        })

        expectOnlyActions([ACTION_LABELS.delete])
    })

    it("should show pin and delete for an admin on someone else's poll", () => {
        renderOverlayScenario({
            event: makePollEvent(),
            currentUserId: ADMIN_ID,
            currentUserPowerLevel: MatrixPowerLevel.Admin,
        })

        expectOnlyActions([ACTION_LABELS.pin, ACTION_LABELS.delete])
    })

    it("should not show the overlay when another member's poll has no available actions", () => {
        renderOverlayScenario({
            event: makePollEvent(),
            currentUserId: MEMBER_ID,
            currentUserPowerLevel: MatrixPowerLevel.Member,
        })

        expectOnlyActions([])
    })
})
