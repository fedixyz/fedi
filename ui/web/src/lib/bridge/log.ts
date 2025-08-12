export async function openBridgeLogFile(): Promise<FileSystemSyncAccessHandle> {
    const root = await navigator.storage.getDirectory()
    const fileHandle = await root.getFileHandle('bridge.0.log', {
        create: true,
    })
    return await fileHandle.createSyncAccessHandle()
}

export async function getBridgeLogFile() {
    const root = await navigator.storage.getDirectory()
    return await root.getFileHandle('bridge.0.log')
}
