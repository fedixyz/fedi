import { useCallback, useRef, useState } from 'react'

/**
 * Hook for managing message file attachments in web.
 * Provides file state management and a unified interface for file operations.
 * Uses native HTML file input for file selection (via triggerFilePicker).
 */
export function useMessageAttachments() {
    const [files, setFiles] = useState<File[]>([])
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const addFiles = useCallback((newFiles: File[]) => {
        setFiles(prev => [...prev, ...newFiles])
    }, [])

    const removeFile = useCallback(
        (idx: number) => {
            const newFiles = [...files.slice(0, idx), ...files.slice(idx + 1)]
            setFiles(newFiles)
        },
        [files],
    )

    const clearAll = useCallback(() => {
        setFiles([])
        // Reset the file input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }, [])

    const triggerFilePicker = useCallback(() => {
        if (!fileInputRef.current) return
        fileInputRef.current?.click()
    }, [])

    const handleFileInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            if (!event.target.files || !event.target.files.length) return
            const filesArr = Array.from(event.target.files)
            addFiles(filesArr)
        },
        [addFiles],
    )

    const hasAttachments = files.length > 0

    return {
        files,
        fileInputRef,
        hasAttachments,
        addFiles,
        removeFile,
        clearAll,
        triggerFilePicker,
        handleFileInputChange,
    }
}
