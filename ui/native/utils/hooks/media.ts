import { CameraRoll } from '@react-native-camera-roll/camera-roll'
import {
    DocumentPickerResponse,
    types as documentTypes,
} from '@react-native-documents/picker'
import crypto from 'crypto'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { exists, TemporaryDirectoryPath } from 'react-native-fs'
import { Asset, ImageLibraryOptions } from 'react-native-image-picker'
import { PermissionStatus, RESULTS } from 'react-native-permissions'
import Share from 'react-native-share'
import RNFetchBlob from 'rn-fetch-blob'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { addTempMediaUriEntry, selectTempMediaUriMap } from '@fedi/common/redux'
import { SupportedFileSource } from '@fedi/common/types/media'
import { makeLog } from '@fedi/common/utils/log'
import {
    mxcHttpUrlToDownloadUrl,
    mxcUrlToHttpUrl,
} from '@fedi/common/utils/matrix'
import {
    isFileUri,
    isHttpUri,
    isMxcUri,
    pathJoin,
    prefixFileUri,
} from '@fedi/common/utils/media'

import { useDownloadPermission } from '.'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import {
    deriveCopyableFileUri,
    makeRandomTempFilePath,
    tryPickAssets,
    tryPickDocuments,
} from '../media'

const log = makeLog('native/utils/hooks/media')

const DEFAULT_IMAGE_OPTIONS: ImageLibraryOptions = {
    mediaType: 'mixed',
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.7,
    videoQuality: 'low',
    formatAsMp4: true,
    selectionLimit: 10,
}

/**
 * On Android, the react-native-image-picker library is breaking the gif animation
 * somehow when it produces the file URI, so we copy the gif from the original path.
 * https://github.com/react-native-image-picker/react-native-image-picker/issues/2064#issuecomment-2460501473
 * TODO: Check if this is fixed upstream (perhaps in the turbo module) and remove this workaround
 */
function applyAndroidGifWorkaround(assets: Asset[]): Asset[] {
    if (Platform.OS === 'ios') return assets

    return assets.map(asset => {
        if (
            asset.originalPath &&
            // Sometimes animated pics are webp files so we include webp in this workaround
            // even though some webp files are not animated and wouldn't be broken
            // but using the original path works either way, perhaps a small perf hit
            // if rn image-picker is optimizing when producing the file URI
            (asset.type?.includes('gif') || asset.type?.includes('webp'))
        ) {
            return {
                ...asset,
                uri: prefixFileUri(asset.originalPath),
            }
        }
        return asset
    })
}

/**
 * Hook for picking media (images/videos) from the device library.
 * Handles loading state and applies Android GIF/WebP workaround.
 */
export function useMediaPicker(options?: Partial<ImageLibraryOptions>) {
    const { t } = useTranslation()
    const toast = useToast()
    const [isLoading, setIsLoading] = useState(false)

    const mergedOptions = useMemo(
        () => ({ ...DEFAULT_IMAGE_OPTIONS, ...options }),
        [options],
    )

    const pickMedia = useCallback(async (): Promise<Asset[]> => {
        setIsLoading(true)
        try {
            const result = await tryPickAssets(mergedOptions, t)
            return result.match(
                assets => applyAndroidGifWorkaround(assets),
                e => {
                    log.error('launchImageLibrary Error: ', e)
                    // Only show a toast if the error is the user's fault
                    if (e._tag === 'UserError') toast.error(t, e)
                    return []
                },
            )
        } finally {
            setIsLoading(false)
        }
    }, [mergedOptions, t, toast])

    return { pickMedia, isLoading }
}

// Default document types for the document picker
const DEFAULT_DOCUMENT_TYPES = [
    documentTypes.csv,
    documentTypes.doc,
    documentTypes.docx,
    documentTypes.pdf,
    documentTypes.plainText,
    documentTypes.ppt,
    documentTypes.pptx,
    documentTypes.xls,
    documentTypes.xlsx,
    documentTypes.zip,
    documentTypes.allFiles,
]

/**
 * Hook for picking documents from the device.
 * Handles loading state and async URI resolution for Android content URIs.
 */
export function useDocumentPicker(allowedTypes?: string[]) {
    const { t } = useTranslation()
    const toast = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [pending, setPending] = useState<DocumentPickerResponse[]>([])

    const types = useMemo(
        () => allowedTypes ?? DEFAULT_DOCUMENT_TYPES,
        [allowedTypes],
    )

    const pickDocuments = useCallback(async (): Promise<
        DocumentPickerResponse[]
    > => {
        setIsLoading(true)
        setPending([])
        const resolvedDocuments: DocumentPickerResponse[] = []

        try {
            const result = await tryPickDocuments(
                {
                    type: types,
                    allowMultiSelection: true,
                    allowVirtualFiles: true,
                },
                t,
            )

            await result.match(
                async files => {
                    setPending(files)

                    await Promise.all(
                        files.map(file =>
                            deriveCopyableFileUri(file).map(uri => {
                                setPending(p =>
                                    p.filter(d => d.uri !== file.uri),
                                )
                                resolvedDocuments.push({ ...file, uri })
                            }),
                        ),
                    )
                },
                e => {
                    log.error('DocumentPicker Error: ', e)
                    // Only show a toast if the error is the user's fault
                    if (e._tag === 'UserError') toast.error(t, e)
                },
            )
        } finally {
            setPending([])
            setIsLoading(false)
        }

        return resolvedDocuments
    }, [types, t, toast])

    return { pickDocuments, isLoading, pending }
}

/**
 * Handles copying, fetching, and downloading file/media resources from specific matrix events, http(s):// URLs, mxc:// URIs, and file:// URIs
 */
export const useDownloadResource = (
    resource: SupportedFileSource | null,
    {
        loadResourceInitially,
    }: {
        /* Whether to try to load the resource immediately by copying it to the temporary directory */
        loadResourceInitially?: boolean
    } = { loadResourceInitially: true },
) => {
    const [isDownloading, setIsDownloading] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isError, setIsError] = useState(false)
    const [uri, setURI] = useState<string | null>(null)

    const { downloadPermission, requestDownloadPermission } =
        useDownloadPermission()
    const { t } = useTranslation()

    const tempMediaUriMap = useAppSelector(selectTempMediaUriMap)
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()

    // Creates a unique hash based on the file source that can be used to reference cached URIs copied to the temp dir
    const resourceHash = useMemo(() => {
        if (!resource) return null

        let identifier: string

        if (typeof resource === 'object') {
            identifier = `${resource.id}-${resource.timestamp}`
        } else if (
            !isMxcUri(resource) &&
            !isHttpUri(resource) &&
            !isFileUri(resource)
        ) {
            return null
        } else {
            identifier = resource
        }

        return crypto
            .createHash('md5')
            .update(JSON.stringify(identifier))
            .digest('hex')
    }, [resource])

    const handleCopyResource = useCallback(async () => {
        if (!resource || !resourceHash) return null

        // try to reuse the resource from `tempMediaUriMap`
        const cachedFileUri = tempMediaUriMap[resourceHash]
        if (cachedFileUri) {
            setURI(cachedFileUri)
            return cachedFileUri
        }

        setIsLoading(true)
        try {
            let fileUri: string

            // Attempt to copy the resource to the temporary directory and set `fileUri`
            // TODO: Ask @ironclad about this code. @manmeet believes we can remove the
            // temp cache on the frontend due to the cache in the bridge.
            if (
                typeof resource === 'object' &&
                resource.content.info?.mimetype
            ) {
                const extension = resource.content.info.mimetype
                    .split('/')
                    .pop()
                const fileName = `${resourceHash}.${extension}`
                const path = pathJoin(TemporaryDirectoryPath, fileName)
                const filePath = await fedimint.matrixDownloadFile(
                    path,
                    resource.content.source,
                )

                fileUri = prefixFileUri(filePath)
            } else if (typeof resource === 'string' && isFileUri(resource)) {
                fileUri = resource
            } else if (typeof resource === 'string') {
                const { path, uri: resolvedUri } = makeRandomTempFilePath(
                    `${resourceHash}.png`,
                )

                const urlToFetch = isMxcUri(resource)
                    ? mxcHttpUrlToDownloadUrl(
                          mxcUrlToHttpUrl(resource, 0, 0) ?? '',
                      )
                    : resource

                if (!urlToFetch) throw new Error('Invalid URI')

                await RNFetchBlob.config({
                    path,
                }).fetch('GET', urlToFetch)

                fileUri = resolvedUri
            } else {
                // TODO: remove me once we fix the types above
                fileUri = ''
            }

            if (await exists(fileUri)) {
                // Adds the resource and its associated resource hash to the `tempMediaUriMap` in case it's needed later
                dispatch(
                    addTempMediaUriEntry({ uri: fileUri, hash: resourceHash }),
                )
                setURI(prefixFileUri(fileUri))
                return fileUri
            } else {
                throw new Error('File does not exist in fs')
            }
        } catch (e) {
            log.error('Failed to load resource', e)
            setIsError(true)
        } finally {
            setIsLoading(false)
        }

        return null
    }, [resource, tempMediaUriMap, dispatch, resourceHash, fedimint])

    const handleDownload = useCallback(async () => {
        if (!resourceHash || !resource) return

        setIsDownloading(true)
        try {
            // Try to reuse the resource from `tempMediaUriMap`
            const uriToDownload =
                tempMediaUriMap[resourceHash] ?? (await handleCopyResource())

            if (!uriToDownload) {
                setIsDownloading(false)
                return
            }

            // Matrix file events are handled using `Share.open` and don't require any special permissions
            if (
                typeof resource === 'object' &&
                resource.content.msgtype === 'm.file'
            ) {
                const filename =
                    Platform.OS === 'android'
                        ? resource.content.body.replace(/\.[a-z]+$/, '')
                        : resource.content.body

                try {
                    const mimetype = resource.content.info?.mimetype
                    if (!mimetype) throw new Error('Invalid resource')
                    await Share.open({
                        filename,
                        type: mimetype,
                        url: uriToDownload,
                    })
                } catch {
                    /* no-op: Cancelled by user */
                }
            } else {
                let permissionStatus: PermissionStatus | undefined =
                    downloadPermission

                if (downloadPermission !== RESULTS.GRANTED)
                    permissionStatus = await requestDownloadPermission()

                if (permissionStatus === RESULTS.GRANTED) {
                    await CameraRoll.saveAsset(uriToDownload, { type: 'auto' })
                } else {
                    throw new Error(t('errors.please-grant-permission'))
                }

                toast.show({
                    status: 'success',
                    content:
                        Platform.OS === 'ios'
                            ? t('feature.chat.saved-to-photo-library')
                            : t('feature.chat.saved-to-pictures'),
                })
            }
        } catch (e) {
            log.error('Failed to download resource', e)
            toast.error(t, e)
        } finally {
            setIsDownloading(false)
        }
    }, [
        toast,
        t,
        handleCopyResource,
        resource,
        downloadPermission,
        requestDownloadPermission,
        resourceHash,
        tempMediaUriMap,
    ])

    useEffect(() => {
        if (!loadResourceInitially || !resourceHash) return

        handleCopyResource()
    }, [
        loadResourceInitially,
        handleCopyResource,
        // When `resource` changes, attempts to re-copy it
        resourceHash,
    ])

    return {
        uri,
        isLoading,
        isError,
        isDownloading,
        handleDownload,
        handleCopyResource,
        setIsError,
    }
}
