import React, { useState } from 'react'

import { ChatJoinOrCreateGroup } from './ChatJoinOrCreateGroup'
import { ChatMemberSearch } from './ChatMemberSearch'

export const ChatNew: React.FC = () => {
    const [isNewGrouping, setIsNewGrouping] = useState(false)

    let content: React.ReactNode
    if (isNewGrouping) {
        content = <ChatJoinOrCreateGroup />
    } else {
        content = (
            <ChatMemberSearch onClickNewGroup={() => setIsNewGrouping(true)} />
        )
    }

    return <>{content}</>
}
