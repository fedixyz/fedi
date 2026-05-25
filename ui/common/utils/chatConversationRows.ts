import orderBy from 'lodash/orderBy'

import { ChatType, MatrixEvent } from '../types'
import { isJoinedRoomMemberEvent, isMultispendEvent } from './matrix'

const CHAT_GROUP_WINDOW_MS = 60_000

export type ChatConversationRowLayout = 'message' | 'systemNotice'

export type ChatConversationRow = {
    event: MatrixEvent
    layout: ChatConversationRowLayout
    showTimestamp: boolean
    showUsername: boolean
    showAvatar: boolean
    showUsernames: boolean
    isLastBubbleInRun: boolean
}

type DerivedEvent = {
    event: MatrixEvent
    layout: ChatConversationRowLayout
    timeGroupId: number
    senderRunId: number | null
}

const isWithinChatGroupWindow = (
    first?: MatrixEvent,
    second?: MatrixEvent,
): boolean => {
    if (!first?.timestamp || !second?.timestamp) {
        return false
    }

    return Math.abs(first.timestamp - second.timestamp) <= CHAT_GROUP_WINDOW_MS
}

const getRowLayout = (event: MatrixEvent): ChatConversationRowLayout =>
    isJoinedRoomMemberEvent(event) ? 'systemNotice' : 'message'

export const makeChatConversationRows = (
    events: MatrixEvent[],
    type: ChatType,
): ChatConversationRow[] => {
    const sortedEvents = orderBy(events, 'timestamp', 'desc')

    if (!sortedEvents.length) {
        return []
    }

    const derivedEvents: DerivedEvent[] = []
    const usernamesByTimeGroup = new Map<number, boolean>()
    let currentTimeGroupId = 0
    let currentSenderRunId = 0
    let previousMessageSender: MatrixEvent['sender'] | undefined
    let previousMessageTimeGroupId: number | undefined

    sortedEvents.forEach((event, index) => {
        const previousEvent = sortedEvents[index - 1]
        const layout = getRowLayout(event)
        const isSameTimeGroup =
            index > 0 && isWithinChatGroupWindow(previousEvent, event)

        if (index > 0) {
            if (!isSameTimeGroup) {
                currentTimeGroupId += 1
            }
        }

        let senderRunId: number | null = null
        if (layout === 'message') {
            if (
                previousMessageSender !== undefined &&
                (previousMessageTimeGroupId !== currentTimeGroupId ||
                    previousMessageSender !== event.sender)
            ) {
                currentSenderRunId += 1
            }

            senderRunId = currentSenderRunId
        }

        const derivedEvent = {
            event,
            layout,
            timeGroupId: currentTimeGroupId,
            senderRunId,
        }

        derivedEvents.push(derivedEvent)

        if (layout === 'message') {
            previousMessageSender = event.sender
            previousMessageTimeGroupId = currentTimeGroupId

            const showUsernamesInGroup =
                usernamesByTimeGroup.get(currentTimeGroupId) ??
                type === ChatType.group

            usernamesByTimeGroup.set(
                currentTimeGroupId,
                showUsernamesInGroup && !isMultispendEvent(event),
            )
        }
    })

    const previousMessageRows: Array<DerivedEvent | undefined> = []
    let previousMessageRow: DerivedEvent | undefined
    derivedEvents.forEach((derivedEvent, index) => {
        previousMessageRows[index] = previousMessageRow
        if (derivedEvent.layout === 'message') {
            previousMessageRow = derivedEvent
        }
    })

    const nextMessageRows: Array<DerivedEvent | undefined> = []
    let nextMessageRow: DerivedEvent | undefined
    for (let index = derivedEvents.length - 1; index >= 0; index -= 1) {
        const derivedEvent = derivedEvents[index]
        nextMessageRows[index] = nextMessageRow
        if (derivedEvent.layout === 'message') {
            nextMessageRow = derivedEvent
        }
    }

    return derivedEvents.map((derivedEvent, index) => {
        const previousEvent = previousMessageRows[index]
        const nextEvent = derivedEvents[index + 1]
        const nextMessageEvent = nextMessageRows[index]
        const isMessageRow = derivedEvent.layout === 'message'
        const isNewestInSenderRun =
            isMessageRow &&
            (!previousEvent ||
                previousEvent.senderRunId !== derivedEvent.senderRunId)
        const isOldestInSenderRun =
            isMessageRow &&
            (!nextMessageEvent ||
                nextMessageEvent.senderRunId !== derivedEvent.senderRunId)
        const isOldestInTimeGroup =
            !nextEvent || nextEvent.timeGroupId !== derivedEvent.timeGroupId

        return {
            event: derivedEvent.event,
            layout: derivedEvent.layout,
            showTimestamp: isOldestInTimeGroup,
            showUsername: isMessageRow && isOldestInSenderRun,
            showAvatar: isMessageRow && isNewestInSenderRun,
            showUsernames:
                isMessageRow &&
                (usernamesByTimeGroup.get(derivedEvent.timeGroupId) ?? false),
            isLastBubbleInRun: isMessageRow && isNewestInSenderRun,
        }
    })
}

export const getChatConversationRowIndex = (
    rows: ChatConversationRow[],
    eventId: string,
) => rows.findIndex(row => row.event.id === eventId)
