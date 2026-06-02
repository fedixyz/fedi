import { useEffect } from 'react'

import { useStabilityPool } from '@fedi/common/hooks/stabilitypool'
import { Federation } from '@fedi/common/types'

export const useStabilityPoolWithMountRefresh = (
    federationId: Federation['id'],
) => {
    const stabilityPool = useStabilityPool(federationId)
    const { refreshBalance } = stabilityPool

    useEffect(() => {
        if (!federationId) return

        refreshBalance()
    }, [federationId, refreshBalance])

    return stabilityPool
}
