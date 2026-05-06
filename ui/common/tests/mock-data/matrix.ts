import { MatrixGroupPreview, MatrixRoom } from '../../types'

export const MOCK_MATRIX_ROOM: MatrixRoom = {
    id: '1',
    name: 'test',
    avatarUrl: null,
    preview: null,
    directUserId: null,
    notificationCount: 0,
    isMarkedUnread: false,
    joinedMemberCount: 1,
    isPreview: false,
    isPublic: null,
    allowKnocking: false,
    roomState: 'joined',
    isDirect: false,
    recencyStamp: null,
}

export function createMockGroupPreview(
    overrides: Partial<MatrixRoom> & { id: string },
): MatrixGroupPreview {
    const roomId = overrides.id
    return {
        info: {
            ...MOCK_MATRIX_ROOM,
            isPublic: true,
            isPreview: true,
            roomState: 'invited',
            ...overrides,
        },
        timeline: [
            {
                id: `$preview-event-${roomId}`,
                roomId,
                senderId: '@user:example.com',
                timestamp: 1700000000000,
                localEcho: false,
                sender: null,
                sendState: null,
                inReply: null,
                mentions: null,
                content: {
                    msgtype: 'm.text',
                    body: 'Hello',
                    formatted: null,
                },
            } as unknown as MatrixGroupPreview['timeline'][0],
        ],
        isDefaultGroup: true,
    }
}
