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

type LongPressEvent = PointerEvent | MouseEvent

type LongPressOptions = {
    delayMs?: number
    moveTolerance?: number
    enableContextMenu?: boolean
    enableMouseLongPress?: boolean
    enabled?: boolean
    shouldHandleContextMenu?: (event: MouseEvent) => boolean
    shouldStartLongPress?: (event: PointerEvent) => boolean
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
    const activated = useRef(false)

    const clearLongPressTimeout = useCallback(() => {
        if (timeoutId.current === null) return

        window.clearTimeout(timeoutId.current)
        timeoutId.current = null
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
            if (e.pointerType === 'mouse' && !enableMouseLongPress) return
            if (shouldStartLongPress && !shouldStartLongPress(e)) return

            startX.current = e.clientX
            startY.current = e.clientY
            clearLongPressTimeout()
            activated.current = false
            timeoutId.current = window.setTimeout(() => {
                timeoutId.current = null
                activated.current = true
                onLongPressRef.current(e)
            }, delayMs)
        }

        const handlePointerMove = (e: PointerEvent) => {
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

        const handlePointerUp = () => {
            clearLongPressTimeout()
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
        element.addEventListener('pointercancel', handlePointerUp)
        element.addEventListener('contextmenu', handleContextMenu)

        return () => {
            element.removeEventListener('pointerdown', handlePointerDown)
            element.removeEventListener('pointermove', handlePointerMove)
            element.removeEventListener('pointerup', handlePointerUp)
            element.removeEventListener('pointercancel', handlePointerUp)
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
