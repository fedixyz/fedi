import { cleanup, screen } from '@testing-library/react-native'
import React from 'react'

import { MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import ChatEvent from '../../../../../components/feature/chat/ChatEvent'
import { renderWithProviders } from '../../../../utils/render'

const roomMemberEvent = (
    change: MatrixEvent<'m.room.member'>['content']['change'],
): MatrixEvent<'m.room.member'> => ({
    id: '$room-member-event' as RpcTimelineEventItemId,
    roomId: '!room:test',
    timestamp: 1750083034389,
    localEcho: false,
    sender: '@alice:test',
    sendState: { kind: 'sent', event_id: 'event123' },
    inReply: null,
    mentions: null,
    content: {
        msgtype: 'm.room.member',
        userId: '@alice:test',
        userDisplayName: 'Alice',
        change,
    },
})

describe('ChatEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should render joined membership events as a system notice', () => {
        renderWithProviders(<ChatEvent event={roomMemberEvent('joined')} />)

        expect(
            screen.getByText(
                i18n.t('feature.chat.member-joined', { user: 'Alice' }),
            ),
        ).toBeOnTheScreen()
    })

    it('should render accepted invitation membership events as a system notice', () => {
        renderWithProviders(
            <ChatEvent event={roomMemberEvent('invitationAccepted')} />,
        )

        expect(
            screen.getByText(
                i18n.t('feature.chat.member-joined', { user: 'Alice' }),
            ),
        ).toBeOnTheScreen()
    })

    it('should not render other membership events', () => {
        renderWithProviders(<ChatEvent event={roomMemberEvent('left')} />)

        expect(
            screen.queryByText(
                i18n.t('feature.chat.member-joined', { user: 'Alice' }),
            ),
        ).toBeNull()
    })
})
