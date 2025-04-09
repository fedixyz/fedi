import { z } from 'zod'

import { ONE_KB, ONE_MB } from '../constants/matrix'

/**
 * Formats a file size in bytes
 *
 * @param bytes - The file size in bytes
 * @returns The rounded file size in B, KB, or MB
 */
const unfixZero = (n: string) => (n.endsWith('.0') ? n.slice(0, -2) : n)
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

export const matrixUrlMetadataSchema = z.object({
    'matrix:image:size': z.number().nullish(),
    'og:description': z.string().nullish(),
    'og:image': z.string().nullish(),
    'og:image:alt': z.string().nullish(),
    'og:image:height': z.number().nullish(),
    'og:image:type': z.string().nullish(),
    'og:image:width': z.number().nullish(),
    'og:site_name': z.string().nullish(),
    'og:title': z.string().nullish(),
    'og:type': z.string().nullish(),
    'og:url': z.string().nullish(),
})

export type MatrixUrlMetadata = z.infer<typeof matrixUrlMetadataSchema>
