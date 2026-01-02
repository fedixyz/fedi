import { DocumentPickerResponse } from '@react-native-documents/picker'
import { useCallback, useMemo, useState } from 'react'
import { Asset } from 'react-native-image-picker'

import { mapMixedMediaToMatrixInput } from '../media'
import { useDocumentPicker, useMediaPicker } from './media'

/**
 * Hook for managing message attachments (media and documents).
 * Orchestrates media and document picker hooks and provides a unified interface
 * for managing attachment state in MessageInput or other components.
 */
export function useMessageAttachments() {
    const [documents, setDocuments] = useState<DocumentPickerResponse[]>([])
    const [media, setMedia] = useState<Asset[]>([])

    const mediaPicker = useMediaPicker()
    const documentPicker = useDocumentPicker()

    const handlePickMedia = useCallback(async () => {
        const assets = await mediaPicker.pickMedia()
        if (assets.length) setMedia(m => [...m, ...assets])
    }, [mediaPicker])

    const handlePickDocuments = useCallback(async () => {
        const docs = await documentPicker.pickDocuments()
        if (docs.length) setDocuments(d => [...d, ...docs])
    }, [documentPicker])

    const removeMedia = useCallback((asset: Asset) => {
        setMedia(m => m.filter(a => a !== asset))
    }, [])

    const removeDocument = useCallback((uri: string) => {
        setDocuments(d => d.filter(doc => doc.uri !== uri))
    }, [])

    const clearAll = useCallback(() => {
        setMedia([])
        setDocuments([])
    }, [])

    const matrixAttachments = useMemo(
        () => mapMixedMediaToMatrixInput({ documents, assets: media }),
        [documents, media],
    )

    const shouldShowDocuments =
        documents.length > 0 || documentPicker.pending.length > 0
    const shouldShowAssets = media.length > 0

    return {
        // State
        media,
        documents,
        documentsPending: documentPicker.pending,
        // Loading
        isUploadingMedia: mediaPicker.isLoading,
        isUploadingDocuments: documentPicker.isLoading,
        // Actions
        handlePickMedia,
        handlePickDocuments,
        removeMedia,
        removeDocument,
        clearAll,
        // For sending
        matrixAttachments,
        hasAttachments: media.length > 0 || documents.length > 0,
        // For conditional rendering
        shouldShowDocuments,
        shouldShowAssets,
    }
}
