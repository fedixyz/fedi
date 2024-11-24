import { DocumentPickerResponse } from 'react-native-document-picker'
import RNFS from 'react-native-fs'

import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('utils/media')

/**
 * Scales an image to fit within a given maxWidth and maxHeight while maintaining its aspect ratio.
 */
export const scaleAttachment = (
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number,
) => {
    let width = originalWidth
    let height = originalHeight

    // Calculate scaling factors
    const widthScale = maxWidth / originalWidth
    const heightScale = maxHeight / originalHeight

    // Check which dimension exceeds the limit and scale accordingly
    if (width > maxWidth && height > maxHeight) {
        if (widthScale < heightScale) {
            // Limit by width
            width = maxWidth
            height *= widthScale // Apply scale to maintain aspect ratio
        } else {
            // Limit by height
            height = maxHeight
            width *= heightScale // Apply scale to maintain aspect ratio
        }
    } else if (width > maxWidth) {
        width = maxWidth
        height *= widthScale
    } else if (height > maxHeight) {
        height = maxHeight
        width *= heightScale
    }

    return { width, height }
}

/**
 * Ensures that the file URI is prefixed with `file://` if it is not already.
 */
export const prefixFileUri = (uri: string) =>
    uri.startsWith('file://') ? uri : `file://${uri}`

/**
 * Joins paths together with a forward slash.
 */
export function pathJoin(...paths: string[]): string {
    return paths.join('/').replace(/\/+/g, '/')
}

/**
 * Converts a DocumentPickerResponse to a file URI.
 * Handles Android content URIs which may not have the filename in the URI.
 */
export async function getUriFromAttachment(
    attachment: DocumentPickerResponse,
): Promise<string> {
    let uri = attachment.uri

    if (uri.startsWith('content://')) {
        const fileName = `${attachment.name}`
        const filePath = `${RNFS.TemporaryDirectoryPath}/${fileName}`

        try {
            const inputStream = await RNFS.readFile(uri, 'base64')
            await RNFS.writeFile(filePath, inputStream, 'base64')

            uri = filePath
        } catch (error) {
            log.error(
                `Error getting content URI ${uri} with file path: ${filePath}`,
                error,
            )
            throw error
        }
    }

    return prefixFileUri(uri)
}
