import { useCallback } from 'react'

import { refreshHistoricalCurrencyRates } from '../redux'
import { makeLog } from '../utils/log'
import { useFedimint } from './fedimint'
import { useCommonDispatch } from './redux'

const log = makeLog('common/hooks/currency')

/**
 * Hook to refresh historical currency rates and update the cached fiat FX info.
 * Ensures consistent error handling and can be used across mobile & PWA.
 */
export function useSyncCurrencyRatesAndCache() {
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()

    return useCallback(
        (federationId?: string) => {
            dispatch(refreshHistoricalCurrencyRates({ fedimint, federationId }))
                .then(() => {
                    log.info(
                        'Successfully refreshed historical currency rates.',
                    )
                })
                .catch(err => {
                    log.warn(
                        'Failed to refresh historical currency rates:',
                        err,
                    )
                })
        },
        [dispatch, fedimint],
    )
}
