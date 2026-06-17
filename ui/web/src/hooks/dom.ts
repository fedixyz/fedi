import Router from 'next/router'
import { RefObject, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useUpdatingRef } from '@fedi/common/hooks/util'

export const useAutosizeTextArea = (
    textAreaRef: HTMLTextAreaElement | null,
    value: string,
) => {
    useEffect(() => {
        if (textAreaRef) {
            // We need to reset the height momentarily to get the correct scrollHeight for the textarea
            textAreaRef.style.height = '0px'
            const scrollHeight = textAreaRef.scrollHeight

            // We then set the height directly, outside of the render loop
            // Trying to set this with state or a ref will product an incorrect value.
            textAreaRef.style.height = scrollHeight + 'px'
        }
    }, [textAreaRef, value])
}

export const useIsTouchScreen = () => {
    return (
        'ontouchstart' in window ||
        ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0)
    )
}

export const useWarnBeforeUnload = (
    shouldWarn: boolean,
    customConfirmationmessage?: string,
) => {
    const { t } = useTranslation()
    const messageRef = useUpdatingRef(
        customConfirmationmessage || t('phrases.changes-may-not-be-saved'),
    )

    useEffect(() => {
        if (!shouldWarn) return

        const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = messageRef.current
            return messageRef.current
        }

        const beforeRouteHandler = (url: string) => {
            if (Router.pathname !== url && !confirm(messageRef.current)) {
                Router.events.emit('routeChangeError')
                throw `Route change to "${url}" was aborted (this error can be safely ignored). See https://github.com/zeit/next.js/issues/2476.`
            }
        }

        window.addEventListener('beforeunload', beforeUnloadHandler)
        Router.events.on('routeChangeStart', beforeRouteHandler)

        return () => {
            window.removeEventListener('beforeunload', beforeUnloadHandler)
            Router.events.off('routeChangeStart', beforeRouteHandler)
        }
    }, [shouldWarn, messageRef])
}

type LongPressEvent = PointerEvent | MouseEvent | TouchEvent

type LongPressOptions = {
    delayMs?: number
    moveTolerance?: number
    enableContextMenu?: boolean
    enableMouseLongPress?: boolean
    enabled?: boolean
    shouldHandleContextMenu?: (event: MouseEvent) => boolean
    shouldStartLongPress?: (event: PointerEvent | TouchEvent) => boolean
}

export function useLongPress<T extends HTMLElement>(
    ref: RefObject<T | null>,
    onLongPress: (event: LongPressEvent) => void,
    {
        delayMs = 500,
        moveTolerance = 36,
        enableContextMenu = false,
        enableMouseLongPress = false,
        enabled = true,
        shouldHandleContextMenu,
        shouldStartLongPress,
    }: LongPressOptions = {},
) {
    const onLongPressRef = useUpdatingRef(onLongPress)
    const startX = useRef(0)
    const startY = useRef(0)
    const timeoutId = useRef<number | null>(null)
    const startedAt = useRef<number | null>(null)
    const pendingLongPressEvent = useRef<LongPressEvent | null>(null)
    const activated = useRef(false)

    const clearLongPressTimeout = useCallback(() => {
        if (timeoutId.current !== null) {
            window.clearTimeout(timeoutId.current)
            timeoutId.current = null
        }

        startedAt.current = null
        pendingLongPressEvent.current = null
    }, [])

    const resetLongPressActivated = useCallback(() => {
        activated.current = false
    }, [])

    const wasLongPressActivated = useCallback(() => {
        return activated.current
    }, [])

    useEffect(() => {
        const element = ref.current
        if (!element) return

        const handlePointerDown = (e: PointerEvent) => {
            if (!enabled) return
            if (!e.isPrimary) return
            // Mobile Safari can emit touch pointer events that are followed by
            // pointercancel/pointerup before the touch sequence finishes. Use
            // touch events as the source of truth for touch long-presses so iOS
            // does not cancel the pending action before touchend.
            if (e.pointerType === 'touch') return
            if (e.pointerType === 'mouse' && !enableMouseLongPress) return
            if (shouldStartLongPress && !shouldStartLongPress(e)) return

            startX.current = e.clientX
            startY.current = e.clientY
            clearLongPressTimeout()
            activated.current = false
            startedAt.current = Date.now()
            pendingLongPressEvent.current = e
            timeoutId.current = window.setTimeout(() => {
                timeoutId.current = null
                startedAt.current = null
                pendingLongPressEvent.current = null
                activated.current = true
                onLongPressRef.current(e)
            }, delayMs)
        }

        const handlePointerMove = (e: PointerEvent) => {
            if (e.pointerType === 'touch') return
            if (!e.isPrimary) return
            if (timeoutId.current === null) return

            const horizontalDistance = Math.abs(e.clientX - startX.current)
            const verticalDistance = Math.abs(e.clientY - startY.current)
            if (
                Math.max(horizontalDistance, verticalDistance) >= moveTolerance
            ) {
                clearLongPressTimeout()
            }
        }

        const handlePointerUp = (e: PointerEvent) => {
            // See handlePointerDown. Touch long-press cleanup must happen from
            // touchend/touchcancel, not touch pointer events, for iOS Safari.
            if (e.pointerType === 'touch') return

            clearLongPressTimeout()
        }

        const handleTouchEnd = (e: TouchEvent) => {
            if (activated.current && pendingLongPressEvent.current !== null) {
                const longPressEvent = pendingLongPressEvent.current

                clearLongPressTimeout()
                onLongPressRef.current(longPressEvent)
                return
            }

            if (
                timeoutId.current !== null &&
                startedAt.current !== null &&
                Date.now() - startedAt.current >= delayMs
            ) {
                // iOS Safari may delay the long-press timer while the touch is
                // active. If the elapsed time is long enough by touchend, treat
                // it as a completed long-press even if the timer callback has
                // not run yet.
                const longPressEvent = pendingLongPressEvent.current || e

                window.clearTimeout(timeoutId.current)
                timeoutId.current = null
                startedAt.current = null
                pendingLongPressEvent.current = null
                activated.current = true
                onLongPressRef.current(longPressEvent)
                return
            }

            clearLongPressTimeout()
        }

        const handlePointerCancel = (e: PointerEvent) => {
            // iOS Safari may send pointercancel during a valid long-press. Do
            // not let that cancel the touch sequence; touchcancel still does.
            if (e.pointerType === 'touch') return

            clearLongPressTimeout()
        }

        const handleTouchStart = (e: TouchEvent) => {
            if (!enabled) return
            if (e.touches.length !== 1) return
            if (shouldStartLongPress && !shouldStartLongPress(e)) return

            const touch = e.touches[0]
            startX.current = touch.clientX
            startY.current = touch.clientY
            clearLongPressTimeout()
            activated.current = false
            startedAt.current = Date.now()
            pendingLongPressEvent.current = e
            timeoutId.current = window.setTimeout(() => {
                timeoutId.current = null
                activated.current = true
                // Do not open while the finger is still down. On iOS Safari
                // opening the drawer during the active touch can race native
                // selection/callout handling; commit the UI from touchend.
            }, delayMs)
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (timeoutId.current === null) return
            if (e.touches.length !== 1) {
                clearLongPressTimeout()
                return
            }

            const touch = e.touches[0]
            const horizontalDistance = Math.abs(touch.clientX - startX.current)
            const verticalDistance = Math.abs(touch.clientY - startY.current)
            if (
                Math.max(horizontalDistance, verticalDistance) >= moveTolerance
            ) {
                clearLongPressTimeout()
            }
        }

        const handleContextMenu = (e: MouseEvent) => {
            if (!enableContextMenu) return
            if (!enabled) return
            if (shouldHandleContextMenu && !shouldHandleContextMenu(e)) return

            e.preventDefault()
            clearLongPressTimeout()
            activated.current = true
            onLongPressRef.current(e)
        }

        element.addEventListener('pointerdown', handlePointerDown)
        element.addEventListener('pointermove', handlePointerMove)
        element.addEventListener('pointerup', handlePointerUp)
        element.addEventListener('pointercancel', handlePointerCancel)
        element.addEventListener('touchstart', handleTouchStart)
        element.addEventListener('touchmove', handleTouchMove)
        // Capture touchend so swipe handlers can see wasLongPressActivated()
        // after the hook commits the iOS long-press state.
        element.addEventListener('touchend', handleTouchEnd, { capture: true })
        element.addEventListener('touchcancel', clearLongPressTimeout)
        element.addEventListener('contextmenu', handleContextMenu)

        return () => {
            element.removeEventListener('pointerdown', handlePointerDown)
            element.removeEventListener('pointermove', handlePointerMove)
            element.removeEventListener('pointerup', handlePointerUp)
            element.removeEventListener('pointercancel', handlePointerCancel)
            element.removeEventListener('touchstart', handleTouchStart)
            element.removeEventListener('touchmove', handleTouchMove)
            element.removeEventListener('touchend', handleTouchEnd, {
                capture: true,
            })
            element.removeEventListener('touchcancel', clearLongPressTimeout)
            element.removeEventListener('contextmenu', handleContextMenu)
            clearLongPressTimeout()
        }
    }, [
        clearLongPressTimeout,
        delayMs,
        enableMouseLongPress,
        enabled,
        enableContextMenu,
        moveTolerance,
        onLongPressRef,
        ref,
        shouldHandleContextMenu,
        shouldStartLongPress,
    ])

    return {
        clearLongPressTimeout,
        resetLongPressActivated,
        wasLongPressActivated,
    }
}
