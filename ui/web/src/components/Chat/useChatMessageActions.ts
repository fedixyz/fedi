import { RefObject, useCallback, useState } from 'react'

import {
    selectCanReply,
    selectMessageReactionsEnabled,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { useAppSelector, useLongPress } from '../../hooks'
import { hasReactionActions, hasReplyAction } from './chatMessageActionUtils'

const LONG_PRESS_DELAY_MS = 500
const LONG_PRESS_MOVE_TOLERANCE = 36
const NATIVE_CONTEXT_MENU_SELECTOR = 'img, video'

function isNativeContextMenuTarget(target: EventTarget | null) {
    return (
        target instanceof Element &&
        !!target.closest(NATIVE_CONTEXT_MENU_SELECTOR)
    )
}

export function useChatMessageActions<T extends HTMLElement>(
    messageRef: RefObject<T | null>,
    event: MatrixEvent,
) {
    const [isActionsOpen, setIsActionsOpen] = useState(false)
    const messageReactionsEnabled = useAppSelector(
        selectMessageReactionsEnabled,
    )
    const canReplyInRoom = useAppSelector(s => selectCanReply(s, event.roomId))
    const hasActions =
        hasReplyAction(event, canReplyInRoom) ||
        hasReactionActions(event, messageReactionsEnabled)

    const openActions = useCallback(() => {
        if (!hasActions) return
        setIsActionsOpen(true)
    }, [hasActions])
    const shouldHandleContextMenu = useCallback(
        (contextMenuEvent: MouseEvent) => {
            return !isNativeContextMenuTarget(contextMenuEvent.target)
        },
        [],
    )
    const shouldStartLongPress = useCallback(
        (longPressEvent: PointerEvent | TouchEvent) => {
            const isMediaTarget = isNativeContextMenuTarget(
                longPressEvent.target,
            )

            if (
                'pointerType' in longPressEvent &&
                longPressEvent.pointerType === 'mouse'
            )
                return isMediaTarget

            return true
        },
        [],
    )

    const {
        clearLongPressTimeout,
        resetLongPressActivated,
        wasLongPressActivated,
    } = useLongPress(messageRef, openActions, {
        delayMs: LONG_PRESS_DELAY_MS,
        moveTolerance: LONG_PRESS_MOVE_TOLERANCE,
        enableContextMenu: true,
        enableMouseLongPress: true,
        enabled: hasActions,
        shouldHandleContextMenu,
        shouldStartLongPress,
    })

    return {
        isActionsOpen,
        setIsActionsOpen,
        clearLongPressTimeout,
        resetLongPressActivated,
        wasLongPressActivated,
    }
}
