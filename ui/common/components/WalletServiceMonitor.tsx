import {
    useMonitorFiClient,
    useMonitorWalletServiceLiquidity,
} from '../hooks/fi'

/**
 * Streams fi client status into redux for the wallet service creation flow, and
 * watches the Lightning attach for the whole app.
 *
 * The attach is watched here rather than by the screen that starts it because
 * the operation is durable in the bridge and outlives any screen. Owning it at
 * this level is what lets the user walk away from it, lets a relaunch report
 * its true state, and lets every Lightning surface read one value.
 */
export default function WalletServiceMonitor() {
    useMonitorFiClient()
    useMonitorWalletServiceLiquidity()

    return null
}
