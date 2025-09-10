import {
    fedimint,
    initializeBridge as initializeBridgeRemote,
    subscribeToBridgeEvents,
} from '@fedi/common/utils/remote-bridge'

export { fedimint }

export async function initializeBridge(deviceId: string) {
    deviceId = sessionStorage.deviceId =
        sessionStorage.deviceId || prompt('give device id')
    // accessible in console
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).fedimint = fedimint
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

export async function getBridgeLogs(): Promise<File> {
    throw new Error('getBridgeLogs is not supported in remote bridge')
}
