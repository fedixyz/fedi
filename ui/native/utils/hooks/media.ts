import { CameraRoll } from '@react-native-camera-roll/camera-roll'
import crypto from 'crypto'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'
import { exists, TemporaryDirectoryPath } from 'react-native-fs'
import { PermissionStatus, RESULTS } from 'react-native-permissions'
import Share from 'react-native-share'
import RNFetchBlob from 'rn-fetch-blob'

import { useToast } from '@fedi/common/hooks/toast'
import { addTempMediaUriEntry, selectTempMediaUriMap } from '@fedi/common/redux'
import { JSONObject } from '@fedi/common/types/bindings'
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
import { fedimint } from '../../bridge'
import { useAppDispatch, useAppSelector } from '../../state/hooks'
import { makeRandomTempFilePath } from '../media'

const log = makeLog('native/utils/hooks/media')

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
    const toast = useToast()

    // Creates a unique hash based on the file source that can be used to reference cached URIs copied to the temp dir
    const resourceHash = useMemo(() => {
        if (!resource) return null

        let identifier: string

        if (typeof resource === 'object') {
            identifier = `${resource.eventId}-${resource.timestamp}`
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
            if (typeof resource === 'object') {
                const extension = resource.content.info.mimetype
                    .split('/')
                    .pop()
                const fileName = `${resourceHash}.${extension}`
                const path = pathJoin(TemporaryDirectoryPath, fileName)
                const filePath = await fedimint.matrixDownloadFile(
                    path,
                    resource.content as JSONObject,
                )

                fileUri = prefixFileUri(filePath)
            } else if (isFileUri(resource)) {
                fileUri = resource
            } else {
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
    }, [resource, tempMediaUriMap, dispatch, resourceHash])

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
                    await Share.open({
                        filename,
                        type: resource.content.info.mimetype,
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
        setIsError,
    }
}
