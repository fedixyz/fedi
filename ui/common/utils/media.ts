import { ONE_KB, ONE_MB } from '../constants/matrix'
import { FileUri, HttpUri, MxcUri } from '../types/media'

const unfixZero = (n: string) => (n.endsWith('.0') ? n.slice(0, -2) : n)

/**
 * Formats a file size in bytes
 *
 * @param bytes - The file size in bytes
 * @returns The rounded file size in B, KB, or MB
 */
export const formatFileSize = (bytes: number) => {
    const kb = (bytes / ONE_KB).toFixed(1)
    const mb = (bytes / ONE_MB).toFixed(1)

    if (bytes < ONE_KB) return `${bytes} B`
    else if (bytes < ONE_MB) return `${unfixZero(kb)} KB`
    else return `${unfixZero(mb)} MB`
}

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
    (uri.startsWith('file://') ? uri : `file://${uri}`) as FileUri

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

export const isMxcUri = (uri: string): uri is MxcUri => uri.startsWith('mxc://')
export const isFileUri = (uri: string): uri is FileUri =>
    uri.startsWith('file://')
export const isHttpUri = (uri: string): uri is HttpUri =>
    uri.startsWith('http://') || uri.startsWith('https://')
