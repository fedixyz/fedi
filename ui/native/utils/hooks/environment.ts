import NetInfo from '@react-native-community/netinfo'
import { ResultAsync } from 'neverthrow'
import { useCallback, useRef, useState } from 'react'

import { setIsInternetUnreachable } from '@fedi/common/redux'
import { TaggedError } from '@fedi/common/utils/errors'

import { useAppDispatch } from '../../state/hooks'
import { checkIsInternetUnreachable } from '../environment'

/**
 * Exposes a function that refetches the internet connection status and updates the redux store
 */
export const useRecheckInternet = () => {
    const dispatch = useAppDispatch()
    const fetchingRef = useRef(false)
    const [wasOffline, setWasOffline] = useState(false)

    return useCallback(async () => {
        let isOffline = wasOffline

        // Prevent concurrent fetches
        if (fetchingRef.current) return { isOffline }

        fetchingRef.current = true

        isOffline = await ResultAsync.fromPromise(
            NetInfo.fetch(),
            // TODO: use a more specific error type
            e => new TaggedError('GenericError', e),
        )
            .map(checkIsInternetUnreachable)
            .unwrapOr(false)

        fetchingRef.current = false
        setWasOffline(isOffline)
        dispatch(setIsInternetUnreachable(isOffline))

        return { isOffline }
    }, [dispatch, wasOffline])
}
