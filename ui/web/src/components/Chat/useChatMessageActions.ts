import { RefObject, useCallback, useState } from 'react'

import { MatrixEvent } from '@fedi/common/types'

import { useLongPress } from '../../hooks'
import { hasMessageActions } from './chatMessageActionUtils'

const LONG_PRESS_DELAY_MS = 500
const LONG_PRESS_MOVE_TOLERANCE = 36

export function useChatMessageActions<T extends HTMLElement>(
    messageRef: RefObject<T | null>,
    event: MatrixEvent,
) {
    const [isActionsOpen, setIsActionsOpen] = useState(false)
    const hasActions = hasMessageActions(event)

    const openActions = useCallback(() => {
        if (!hasActions) return
        setIsActionsOpen(true)
    }, [hasActions])

    const {
        clearLongPressTimeout,
        resetLongPressActivated,
        wasLongPressActivated,
    } = useLongPress(messageRef, openActions, {
        delayMs: LONG_PRESS_DELAY_MS,
        moveTolerance: LONG_PRESS_MOVE_TOLERANCE,
        enableContextMenu: true,
        enabled: hasActions,
    })

    return {
        isActionsOpen,
        setIsActionsOpen,
        clearLongPressTimeout,
        resetLongPressActivated,
        wasLongPressActivated,
    }
}
