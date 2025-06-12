import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
    selectMatrixStatus,
    selectNeedsMatrixRegistration,
} from '@fedi/common/redux'
import { MatrixSyncStatus } from '@fedi/common/types'

import { ChatBlock } from '../../components/Chat/ChatBlock'
import { ChatNeedRegistration } from '../../components/Chat/ChatNeedRegistration'
import { ChatNew } from '../../components/Chat/ChatNew'
import { ChatRoomConversation } from '../../components/Chat/ChatRoomConversation'
import { ChatUserConversation } from '../../components/Chat/ChatUserConversation'
import { CircularLoader } from '../../components/CircularLoader'
import { ContentBlock } from '../../components/ContentBlock'
import { Redirect } from '../../components/Redirect'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

function ChatPage() {
    const { t } = useTranslation()
    const { query, isReady } = useRouter()
    const syncStatus = useAppSelector(selectMatrixStatus)
    const needsChatRegistration = useAppSelector(selectNeedsMatrixRegistration)

    const [chatType, chatId] = Array.isArray(query.path)
        ? [query.path[0], query.path[1]]
        : []

    // While we have the page open, immediately mark the latest message as seen.
    // TODO: reimplement with matrix?
    // useUpdateLastMessageSeen()

    if (!isReady) return null

    let content: React.ReactNode
    let isShowingContent = true

    if (syncStatus === MatrixSyncStatus.initialSync) {
        content = (
            <EmptyMessage>
                <CircularLoader />
            </EmptyMessage>
        )
    }

    // Regardless of which page they're on, if they need to register a username
    // or upgrade to matrix chat then intercept here
    else if (needsChatRegistration) {
        return (
            <ContentBlock>
                <ChatNeedRegistration />
            </ContentBlock>
        )
    } else if (chatType === 'new') {
        content = <ChatNew />
    } else if (chatType === 'user' && chatId) {
        content = <ChatUserConversation key={chatId} userId={chatId} />
    } else if (chatType === 'room' && chatId) {
        content = <ChatRoomConversation key={chatId} roomId={chatId} />
    } else if (!chatType) {
        isShowingContent = false
        content = (
            <EmptyMessage>{t('feature.chat.select-or-start')}</EmptyMessage>
        )
    } else {
        return <Redirect path="/chat" />
    }

    return <ChatBlock isShowingContent={isShowingContent}>{content}</ChatBlock>
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
