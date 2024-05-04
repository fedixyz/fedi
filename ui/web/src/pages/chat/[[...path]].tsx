import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useUpdateLastMessageSeen } from '@fedi/common/hooks/chat'
import { selectNeedsChatRegistration } from '@fedi/common/redux'

import { ChatBlock } from '../../components/ChatBlock'
import { ChatGroupConversation } from '../../components/ChatGroupConversation'
import { ChatMemberConversation } from '../../components/ChatMemberConversation'
import { ChatNeedRegistration } from '../../components/ChatNeedRegistration'
import { ChatNew } from '../../components/ChatNew'
import { ContentBlock } from '../../components/ContentBlock'
import { Redirect } from '../../components/Redirect'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'

function ChatPage() {
    const { t } = useTranslation()
    const { query, isReady } = useRouter()
    const needsChatRegistration = useAppSelector(selectNeedsChatRegistration)

    const [chatType, chatId] = Array.isArray(query.path)
        ? [query.path[0], query.path[1]]
        : []

    // While we have the page open, immediately mark the latest message as seen.
    useUpdateLastMessageSeen()

    if (!isReady) return null

    // Regardless of which page they're on, if they need to register a username then show them this screen.
    if (needsChatRegistration) {
        return (
            <ContentBlock>
                <ChatNeedRegistration />
            </ContentBlock>
        )
    }

    let content: React.ReactNode
    let isShowingContent = true
    if (chatType === 'new') {
        content = <ChatNew />
    } else if (chatType === 'member' && chatId) {
        content = <ChatMemberConversation memberId={chatId} />
    } else if (chatType === 'group' && chatId) {
        content = <ChatGroupConversation groupId={chatId} />
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
