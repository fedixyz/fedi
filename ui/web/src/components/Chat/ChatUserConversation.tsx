import { useRouter } from 'next/router'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

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
import { ChatConversation } from './ChatConversation'

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
        async (body: string) => {
            const res = await dispatch(
                sendMatrixDirectMessage({ fedimint, userId, body }),
            ).unwrap()
            replace(`/chat/room/${res.roomId}`)
        },
        [dispatch, userId, replace],
    )

    return (
        <ChatConversation
            type={ChatType.direct}
            id={userId}
            name={name}
            events={[]}
            onSendMessage={handleSend}
            isNewChat
        />
    )
}
