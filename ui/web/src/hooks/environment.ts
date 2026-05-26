import { useEffect } from 'react'

import { setIsInternetUnreachable } from '@fedi/common/redux'

import { useAppDispatch } from './store'

export const useInternetConnectionStatus = () => {
    const dispatch = useAppDispatch()

    useEffect(() => {
        const updateOnlineStatus = () => {
            dispatch(
                setIsInternetUnreachable(window.navigator.onLine === false),
            )
        }

        updateOnlineStatus()
        window.addEventListener('online', updateOnlineStatus)
        window.addEventListener('offline', updateOnlineStatus)

        return () => {
            window.removeEventListener('online', updateOnlineStatus)
            window.removeEventListener('offline', updateOnlineStatus)
        }
    }, [dispatch])
}
