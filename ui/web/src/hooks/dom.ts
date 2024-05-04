import Router from 'next/router'
import { useEffect } from 'react'
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
