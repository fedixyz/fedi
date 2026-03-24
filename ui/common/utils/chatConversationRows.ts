import orderBy from 'lodash/orderBy'

import { ChatType, MatrixEvent } from '../types'
import { isMultispendEvent } from './matrix'

const CHAT_GROUP_WINDOW_MS = 60_000

export type ChatConversationRow = {
    event: MatrixEvent
    showTimestamp: boolean
    showUsername: boolean
    showAvatar: boolean
    showUsernames: boolean
    isLastBubbleInRun: boolean
}

type DerivedEvent = {
    event: MatrixEvent
    timeGroupId: number
    senderRunId: number
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

    sortedEvents.forEach((event, index) => {
        const previousEvent = sortedEvents[index - 1]
        const isSameTimeGroup =
            index > 0 && isWithinChatGroupWindow(previousEvent, event)

        if (index > 0) {
            if (!isSameTimeGroup) {
                currentTimeGroupId += 1
                currentSenderRunId += 1
            } else if (previousEvent?.sender !== event.sender) {
                currentSenderRunId += 1
            }
        }

        derivedEvents.push({
            event,
            timeGroupId: currentTimeGroupId,
            senderRunId: currentSenderRunId,
        })

        const showUsernamesInGroup =
            usernamesByTimeGroup.get(currentTimeGroupId) ??
            type === ChatType.group

        usernamesByTimeGroup.set(
            currentTimeGroupId,
            showUsernamesInGroup && !isMultispendEvent(event),
        )
    })

    return derivedEvents.map((derivedEvent, index) => {
        const previousEvent = derivedEvents[index - 1]
        const nextEvent = derivedEvents[index + 1]
        const isNewestInSenderRun =
            !previousEvent ||
            previousEvent.senderRunId !== derivedEvent.senderRunId
        const isOldestInSenderRun =
            !nextEvent || nextEvent.senderRunId !== derivedEvent.senderRunId
        const isOldestInTimeGroup =
            !nextEvent || nextEvent.timeGroupId !== derivedEvent.timeGroupId

        return {
            event: derivedEvent.event,
            showTimestamp: isOldestInTimeGroup,
            showUsername: isOldestInSenderRun,
            showAvatar: isNewestInSenderRun,
            showUsernames:
                usernamesByTimeGroup.get(derivedEvent.timeGroupId) ?? false,
            isLastBubbleInRun: isNewestInSenderRun,
        }
    })
}

export const getChatConversationRowIndex = (
    rows: ChatConversationRow[],
    eventId: string,
) => rows.findIndex(row => row.event.id === eventId)
