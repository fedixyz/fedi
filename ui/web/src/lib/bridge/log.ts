const opfsUnavailableMessage =
    'Fedi web bridge requires Origin Private File System storage, but this browser context does not expose navigator.storage.getDirectory(). This usually happens when loading the local dev server from another device over http://<LAN-IP>. Use HTTPS or localhost.'

export async function getBridgeStorageRoot(): Promise<FileSystemDirectoryHandle> {
    if (!globalThis.isSecureContext || !navigator.storage?.getDirectory) {
        throw new Error(opfsUnavailableMessage)
    }

    return await navigator.storage.getDirectory()
}

export async function openBridgeLogFile(): Promise<FileSystemSyncAccessHandle> {
    const root = await getBridgeStorageRoot()
    const fileHandle = await root.getFileHandle('bridge.0.log', {
        create: true,
    })
    return await fileHandle.createSyncAccessHandle()
}

export async function getBridgeLogFile() {
    const root = await getBridgeStorageRoot()
    return await root.getFileHandle('bridge.0.log')
}
