import { RefObject, useCallback, useState } from 'react'

import { selectMessageReactionsEnabled } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { useAppSelector, useLongPress } from '../../hooks'
import { hasMessageActions, hasReactionActions } from './chatMessageActionUtils'

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
    const hasActions =
        hasMessageActions(event) ||
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
    const shouldStartLongPress = useCallback((pointerEvent: PointerEvent) => {
        const isMediaTarget = isNativeContextMenuTarget(pointerEvent.target)

        if (pointerEvent.pointerType === 'mouse') return isMediaTarget

        return !isMediaTarget
    }, [])

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
