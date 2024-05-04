import { useRouter } from 'next/router'
import React from 'react'

import { ChatCreateRoom } from './ChatCreateRoom'
import { ChatUserSearch } from './ChatUserSearch'

export const ChatNew: React.FC = () => {
    const { query, isReady } = useRouter()

    const [chatType] = Array.isArray(query.path) ? [query.path[1]] : []

    if (!isReady) return null

    return chatType === 'room' ? <ChatCreateRoom /> : <ChatUserSearch />
}
