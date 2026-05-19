import { useRouter } from 'next/router'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import {
    fetchMatrixProfile,
    selectMatrixAuth,
    selectMatrixDirectMessageRoom,
    sendMatrixDirectMessage,
    selectMatrixUser,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'
import { Avatar } from '../Avatar'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'
import { ChatEmptyState } from './ChatEmptyState'
import { MessageInput } from './MessageInput'

interface Props {
    userId: string
}

export const ChatUserConversation: React.FC<Props> = ({ userId }) => {
    const { t } = useTranslation()
    const { query, replace } = useRouter()
    const dispatch = useAppDispatch()
    const user = useAppSelector(s => selectMatrixUser(s, userId))
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const existingRoom = useAppSelector(s =>
        selectMatrixDirectMessageRoom(s, userId),
    )

    // If there is a user display name then prioritize that
    // If not then either use the display name in the query or "unknown"
    const name =
        user?.displayName ||
        (query?.displayName
            ? decodeURIComponent(String(query?.displayName))
            : t('words.unknown'))

    // Fetch the user's profile so we can display their name/avatar
    useEffect(() => {
        if (user) return
        dispatch(fetchMatrixProfile({ fedimint, userId }))
    }, [userId, user, dispatch])

    // If this is a chat with ourselves, redirect to main chat screen
    useEffect(() => {
        if (userId === matrixAuth?.userId) {
            replace('/chat')
        }
    }, [userId, matrixAuth, replace])

    // If we already have a chat room with this user, redirect there
    useEffect(() => {
        if (!existingRoom) return
        replace(`/chat/room/${existingRoom.id}`)
    }, [existingRoom, replace])

    const handleSend = useCallback(
        async (
            body: string,
            _files: File[],
            repliedEventId?: string | null,
        ) => {
            const res = await dispatch(
                sendMatrixDirectMessage({
                    fedimint,
                    userId,
                    body,
                    repliedEventId: repliedEventId ?? undefined,
                }),
            ).unwrap()
            replace(`/chat/room/${res.roomId}`)
        },
        [dispatch, userId, replace],
    )

    const avatar = user ? (
        <ChatAvatar user={user} size="sm" />
    ) : (
        <Avatar size="sm" id={userId} name={name} />
    )

    return (
        <ChatWrapper>
            <HeaderWrapper back="/chat">
                <HeaderContent>
                    {avatar}
                    <HeaderText weight="medium">{name}</HeaderText>
                </HeaderContent>
            </HeaderWrapper>
            <ChatEmptyState>
                <Icon icon="Chat" size={70} color={fediTheme.colors.grey} />
                <Text>
                    {t('feature.chat.no-messages')}
                    <br />
                    {t('feature.chat.start-the-conversation')}
                </Text>
            </ChatEmptyState>
            <MessageInput
                type={ChatType.direct}
                id={userId}
                onMessageSubmitted={handleSend}
            />
        </ChatWrapper>
    )
}

const ChatWrapper = styled('div', {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
})

const HeaderWrapper = styled(Layout.Header, {
    position: 'relative',
})

const HeaderContent = styled('div', {
    display: 'flex',
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    maxWidth: '70%',
    margin: 'auto',
})

const HeaderText = styled(Text, {
    maxWidth: '80%',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
})
