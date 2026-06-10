import { useCommonSelector } from '../hooks/redux'
import { useMonitorStabilityPool } from '../hooks/stabilitypool'
import { selectLoadedFederationIds } from '../redux'

/**
 * Monitors the stability pool for all loaded federations.
 */
export default function StabilityPoolMonitorManager() {
    const federationIds = useCommonSelector(selectLoadedFederationIds)

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
