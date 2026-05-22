import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import {
    setMatrixAuth,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import { MatrixAuth, MatrixEvent, MatrixRoomMember } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import { ChatEvent } from '../../../../src/components/Chat/ChatEvent'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const ROOM_ID = '!poll-room:example.com'
const SELF_ID = '@self:example.com'

function makePollEvent(): MatrixEvent<'m.poll'> {
    return {
        id: '$poll-event' as RpcTimelineEventItemId,
        roomId: ROOM_ID,
        timestamp: Date.now(),
        localEcho: false,
        sender: '@other:example.com',
        sendState: null,
        inReply: null,
        mentions: null,
        content: {
            msgtype: 'm.poll',
            body: 'Where should we meet?',
            kind: 'disclosed',
            maxSelections: 1,
            answers: [
                { id: 'answer-1', text: 'Lobby' },
                { id: 'answer-2', text: 'Courtyard' },
            ],
            votes: {},
            endTime: null,
            hasBeenEdited: false,
        },
    }
}

function makeStore() {
    const store = setupStore()
    store.dispatch(
        setMatrixAuth({
            userId: SELF_ID,
            deviceId: 'device-1',
        } as MatrixAuth),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: [
                {
                    id: SELF_ID,
                    displayName: 'Self',
                    avatarUrl: undefined,
                    powerLevel: { type: 'int', value: 0 },
                    roomId: ROOM_ID,
                    membership: 'join',
                    ignored: false,
                } as MatrixRoomMember,
            ],
        }),
    )
    return store
}

describe('/components/Chat/ChatEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should render poll events instead of the unsupported message fallback', () => {
        renderWithProviders(<ChatEvent event={makePollEvent()} />, {
            store: makeStore(),
        })

        expect(screen.getByText('Where should we meet?')).toBeInTheDocument()
        expect(screen.getByText('Lobby')).toBeInTheDocument()
        expect(
            screen.queryByText(
                i18n.t('feature.chat.message-could-not-be-displayed'),
            ),
        ).not.toBeInTheDocument()
    })
})
