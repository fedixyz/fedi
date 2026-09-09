import React from 'react'

import WalletServiceMonitor from '@fedi/common/components/WalletServiceMonitor'

import { useIsAppForeground } from '../../../utils/hooks/appForeground'

/**
 * A component rather than a hook call in `App`: the flag changes on every
 * resume, and reading it at the root would re-render the whole provider tree.
 */
export const WalletServiceMonitorHost: React.FC = () => {
    const isForeground = useIsAppForeground()

    return <WalletServiceMonitor isForeground={isForeground} />
}
