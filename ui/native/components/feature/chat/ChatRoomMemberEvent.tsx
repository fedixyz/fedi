import React from 'react'
import { useTranslation } from 'react-i18next'

import { MatrixEvent } from '@fedi/common/types'
import { matrixIdToUsername } from '@fedi/common/utils/matrix'

import ChatSystemNoticeEvent from './ChatSystemNoticeEvent'

type Props = {
    event: MatrixEvent<'m.room.member'>
}

const ChatRoomMemberEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const displayName =
        event.content.userDisplayName ||
        matrixIdToUsername(event.content.userId)

    return (
        <ChatSystemNoticeEvent
            text={t('feature.chat.member-joined', { user: displayName })}
        />
    )
}

export default ChatRoomMemberEvent
