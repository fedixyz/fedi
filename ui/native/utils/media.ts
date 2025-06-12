import { DocumentPickerResponse } from 'react-native-document-picker'
import RNFS from 'react-native-fs'

import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('utils/media')

/**
 * Ensures that the file URI is prefixed with `file://` if it is not already.
 */
export const prefixFileUri = (uri: string) =>
    uri.startsWith('file://') ? uri : `file://${uri}`

/**
 * Strips off file:// from a file URI if it is present.
 */
export const stripFileUriPrefix = (uri: string) =>
    uri.startsWith('file://') ? uri.slice(7) : uri

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
