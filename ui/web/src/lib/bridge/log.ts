const nthLogFile = (n: number) => `bridge.${n}.log`

export async function openBridgeLogFile(): Promise<FileSystemSyncAccessHandle> {
    const root = await navigator.storage.getDirectory()
    const openNthLogFile = async (n: number) => {
        const fileHandle = await root.getFileHandle(nthLogFile(n), {
            create: true,
        })
        return await fileHandle.createSyncAccessHandle()
    }

    const currentFile = await openNthLogFile(0)
    return currentFile
}

export async function getAllBridgeLogFiles() {
    const root = await navigator.storage.getDirectory()
    return [await root.getFileHandle(nthLogFile(0))]
}
