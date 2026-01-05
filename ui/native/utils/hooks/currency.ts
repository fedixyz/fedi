import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'

// syncs the currency rates and cache on mount, or whenever the app is focused
export function useSyncCurrencyRatesOnFocus(federationId: string | undefined) {
    const syncRatesAndCache = useSyncCurrencyRatesAndCache()

    useFocusEffect(
        useCallback(
            () => syncRatesAndCache(federationId),
            [syncRatesAndCache, federationId],
        ),
    )
}
