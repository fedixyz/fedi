import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import { selectLoadedFederations } from '@fedi/common/redux'

import { useAppSelector } from '../state/hooks'

/**
 * Monitors the stability pool for all federations.
 */
export default function StabilityPoolMonitorManager() {
    const federationIds = useAppSelector(state =>
        selectLoadedFederations(state).map(federation => federation.id),
    )

    return (
        <>
            {federationIds.map(federationId => (
                <FederationStabilityPoolMonitor
                    key={federationId}
                    federationId={federationId}
                />
            ))}
        </>
    )
}

function FederationStabilityPoolMonitor({
    federationId,
}: {
    federationId: string
}) {
    useMonitorStabilityPool(federationId)

    return null
}
