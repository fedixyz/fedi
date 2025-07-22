import {
    initializeBridge as initializeBridgeRemote,
    subscribeToBridgeEvents,
} from '@fedi/common/utils/remote-bridge'

export { fedimint } from '@fedi/common/utils/remote-bridge'

export async function initializeBridge(deviceId: string) {
    await initializeBridgeRemote(deviceId)
    await subscribeToBridgeEvents()
}

// Mock implementations for web-specific bridge functions that aren't available in remote bridge
export async function readBridgeFile(
    _path: string,
): Promise<Uint8Array | string> {
    throw new Error('readBridgeFile is not supported in remote bridge')
}

export async function writeBridgeFile(
    _path: string,
    _data: Uint8Array,
): Promise<void> {
    throw new Error('writeBridgeFile is not supported in remote bridge')
}

export async function getBridgeLogs(): Promise<FileSystemFileHandle[]> {
    throw new Error('getBridgeLogs is not supported in remote bridge')
}
