import RNDI from 'react-native-device-info'

import {
    fedimint,
    getAppFlavor,
    initializeBridge as initializeBridgeRemote,
    unsubscribeFromBridgeEvents,
    subscribeToBridgeEvents,
} from '@fedi/common/utils/remote-bridge'
import { RpcAppFlavor } from '@fedi/common/types/bindings'

export { fedimint, getAppFlavor, subscribeToBridgeEvents, unsubscribeFromBridgeEvents }

export async function initializeBridge(
    _deviceId: string,
    _ignoreAppFlavor?: RpcAppFlavor['type'],
) {
    const deviceId = `remote-bridge:pkg:${RNDI.getBundleId()}`
    await initializeBridgeRemote(deviceId)
}
