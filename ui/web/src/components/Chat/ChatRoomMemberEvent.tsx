import React from 'react'
import { useTranslation } from 'react-i18next'

import { MatrixEvent } from '@fedi/common/types'
import { matrixIdToUsername } from '@fedi/common/utils/matrix'

import { styled, theme } from '../../styles'

type Props = {
    event: MatrixEvent<'m.room.member'>
}

export const ChatRoomMemberEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const displayName =
        event.content.userDisplayName ||
        matrixIdToUsername(event.content.userId)

    return (
        <SystemNotice>
            {t('feature.chat.member-joined', { user: displayName })}
        </SystemNotice>
    )
}

const SystemNotice = styled('div', {
    color: theme.colors.darkGrey,
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
    lineHeight: '18px',
    padding: `0 ${theme.spacing.lg}`,
    textAlign: 'center',
    width: '100%',
})
