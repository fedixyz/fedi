import { useRouter } from 'next/router'
import React, { useCallback, useEffect } from 'react'

import {
    selectMatrixAuth,
    selectMatrixDirectMessageRoom,
    selectMatrixUser,
    sendMatrixDirectMessage,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../hooks'
import { ChatConversation } from './ChatConversation'

interface Props {
    userId: string
}

export const ChatUserConversation: React.FC<Props> = ({ userId }) => {
    const { replace } = useRouter()
    const dispatch = useAppDispatch()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const user = useAppSelector(s => selectMatrixUser(s, userId))
    const existingRoom = useAppSelector(s =>
        selectMatrixDirectMessageRoom(s, userId),
    )

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
                sendMatrixDirectMessage({ userId, body }),
            ).unwrap()
            replace(`/chat/room/${res.roomId}`)
        },
        [dispatch, userId, replace],
    )

    return (
        <>
            <ChatConversation
                type={ChatType.direct}
                id={userId}
                name={user?.displayName || userId}
                events={[]}
                onSendMessage={handleSend}
            />
        </>
    )
}
