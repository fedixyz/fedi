import React from 'react'
import { useTranslation } from 'react-i18next'

import { useReplies } from '@fedi/common/hooks/matrix'
import { clearChatReplyingToMessage } from '@fedi/common/redux'
import { MatrixEvent, MatrixRoomMember } from '@fedi/common/types'

import { useAppDispatch } from '../../hooks'
import { styled, theme } from '../../styles'

type MessageInputReplyBarProps = {
    repliedEvent: MatrixEvent
    roomMembers: MatrixRoomMember[]
}

const MessageInputReplyBar: React.FC<MessageInputReplyBarProps> = ({
    repliedEvent,
    roomMembers,
}) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { senderName, bodySnippet } = useReplies(repliedEvent, roomMembers)

    return (
        <ReplyBar>
            <ReplyIndicator />
            <ReplyContent>
                <ReplySender>
                    {t('feature.chat.replying-to', { name: senderName })}
                </ReplySender>
                <ReplyBody>{bodySnippet}</ReplyBody>
            </ReplyContent>
            <ReplyCloseButton
                type="button"
                onClick={() => dispatch(clearChatReplyingToMessage())}>
                ×
            </ReplyCloseButton>
        </ReplyBar>
    )
}

const ReplyBar = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px',
    backgroundColor: theme.colors.offWhite100,
    borderTop: `1px solid ${theme.colors.lightGrey}`,
})

const ReplyIndicator = styled('div', {
    width: 4,
    height: 35,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    flexShrink: 0,
})

const ReplyContent = styled('div', {
    flex: 1,
    minWidth: 0,
})

const ReplySender = styled('div', {
    fontSize: 14,
    fontWeight: 700,
    color: theme.colors.darkGrey,
    marginBottom: 2,
})

const ReplyBody = styled('div', {
    fontSize: 13,
    color: theme.colors.grey,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
})

const ReplyCloseButton = styled('button', {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    color: theme.colors.grey,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 4,
    '&:hover': {
        backgroundColor: theme.colors.primary10,
    },
})

export default MessageInputReplyBar
