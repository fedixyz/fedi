import { useRouter } from 'next/router'
import React from 'react'

import { selectMatrixStatus } from '@fedi/common/redux'
import { MatrixSyncStatus } from '@fedi/common/types'

import { ChatBlock } from '../../components/Chat/ChatBlock'
import { ChatList } from '../../components/Chat/ChatList'
import { ChatNew } from '../../components/Chat/ChatNew'
import { ChatRoomConversation } from '../../components/Chat/ChatRoomConversation'
import { ChatUserConversation } from '../../components/Chat/ChatUserConversation'
import { CircularLoader } from '../../components/CircularLoader'
import { Redirect } from '../../components/Redirect'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

function ChatPage() {
    const { query, isReady } = useRouter()
    const syncStatus = useAppSelector(selectMatrixStatus)

    const [chatType, chatId] = Array.isArray(query.path)
        ? [query.path[0], query.path[1]]
        : []

    // While we have the page open, immediately mark the latest message as seen.
    // TODO: reimplement with matrix?
    // useUpdateLastMessageSeen()

    if (!isReady) return null

    let content: React.ReactNode

    if (syncStatus === MatrixSyncStatus.initialSync) {
        content = (
            <EmptyMessage>
                <CircularLoader />
            </EmptyMessage>
        )
    } else if (chatType === 'new') {
        content = <ChatNew />
    } else if (chatType === 'user' && chatId) {
        content = <ChatUserConversation key={chatId} userId={chatId} />
    } else if (chatType === 'room' && chatId) {
        content = <ChatRoomConversation key={chatId} roomId={chatId} />
    } else if (!chatType) {
        content = <ChatList />
    } else {
        return <Redirect path="/chat" />
    }

    return <ChatBlock>{content}</ChatBlock>
}

const EmptyMessage = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    height: '100%',
    padding: 24,
    color: theme.colors.darkGrey,
})

export default ChatPage
