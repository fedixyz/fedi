import { TFunction } from 'i18next'
import { useCallback, useMemo } from 'react'

import {
    closeToast as reduxCloseToast,
    showToast as reduxShowToast,
} from '@fedi/common/redux'
import { ToastArgs } from '@fedi/common/types'
import { formatErrorMessage } from '@fedi/common/utils/format'

import { useCommonDispatch } from './redux'

export type ToastHandler = {
    show: (toast: string | ToastArgs) => void
    error: (t: TFunction, err: unknown, defaultMsg?: string) => void
    close: (key?: string) => void
}

export function useToast() {
    const dispatch = useCommonDispatch()

    const show = useCallback(
        (toast: string | ToastArgs) => {
            const args = typeof toast === 'string' ? { content: toast } : toast
            dispatch(reduxShowToast(args))
        },
        [dispatch],
    )

    const error = useCallback(
        (t: TFunction, err: unknown, defaultMsg = 'errors.unknown-error') => {
            show({
                content: formatErrorMessage(t, err, defaultMsg),
                status: 'error',
            })
        },
        [show],
    )

    const close = useCallback(
        (key?: string) => {
            dispatch(reduxCloseToast(key))
        },
        [dispatch],
    )

    return useMemo(() => {
        return { show, error, close }
    }, [show, error, close])
}
