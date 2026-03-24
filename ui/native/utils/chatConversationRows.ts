export type { ChatConversationRow } from '@fedi/common/utils/chatConversationRows'
export {
    makeChatConversationRows,
    getChatConversationRowIndex,
} from '@fedi/common/utils/chatConversationRows'

export type ChatConversationListHandle = {
    scrollToIndex: (params: {
        index: number
        animated: boolean
        viewOffset: number
        viewPosition: number
    }) => void
    scrollToOffset: (params: { offset: number; animated: boolean }) => void
}

export const CHAT_CONVERSATION_SCROLL_OPTIONS = {
    animated: false,
    viewOffset: 100,
    viewPosition: 0.5,
} as const

export const scrollToChatConversationEvent = ({
    eventId,
    eventIndexById,
    listRef,
    setHighlightedMessageId,
    highlightDuration,
}: {
    eventId: string
    eventIndexById: Map<string, number>
    listRef: { current: ChatConversationListHandle | null }
    setHighlightedMessageId: (messageId: string | null) => void
    highlightDuration: number
}): {
    index: number
    timeout: ReturnType<typeof setTimeout>
} | null => {
    const targetIndex = eventIndexById.get(eventId)

    if (targetIndex === undefined) {
        return null
    }

    setHighlightedMessageId(eventId)
    listRef.current?.scrollToIndex({
        index: targetIndex,
        ...CHAT_CONVERSATION_SCROLL_OPTIONS,
    })

    return {
        index: targetIndex,
        timeout: setTimeout(
            () => setHighlightedMessageId(null),
            highlightDuration,
        ),
    }
}
