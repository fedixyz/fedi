import { useEffect, useState, useMemo, RefObject } from 'react'

import { MatrixEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { scaleAttachment } from '@fedi/common/utils/media'

import { fedimint, readBridgeFile } from '../lib/bridge/'

const log = makeLog('useLoadMedia')

// === useLoadMedia hook ===
// This hook is responsible for loading media files from the
// bridge and then caching them to prevent unnecessary re-fetches
// and improve performance.
const mediaCache = new Map<string, string>()

export function useLoadMedia(
    event: MatrixEvent<'m.video' | 'm.image' | 'm.file'>,
) {
    const [src, setSrc] = useState<string | null>(null)
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<boolean>(false)

    const { id, content } = event
    const { body, source, info } = content
    const mimeType = info?.mimetype ?? undefined

    useEffect(() => {
        let objectUrl: string | null = null

        const cachedUrl = mediaCache.get(id)
        if (cachedUrl) {
            setSrc(cachedUrl)
            return
        }

        const loadMedia = async () => {
            setLoading(true)

            try {
                const mediaPath = await fedimint.matrixDownloadFile(
                    body,
                    source,
                )
                const result = await readBridgeFile(mediaPath)

                objectUrl = URL.createObjectURL(
                    new Blob(
                        [
                            typeof result === 'string'
                                ? result
                                : Uint8Array.from(result),
                        ],
                        { type: mimeType },
                    ),
                )

                mediaCache.set(id, objectUrl)

                setSrc(objectUrl)
            } catch {
                log.error('failed to load media')
                setError(true)
            } finally {
                setLoading(false)
            }
        }

        loadMedia()

        return () => {
            const current = mediaCache.get(id)
            if (objectUrl && current !== objectUrl) {
                URL.revokeObjectURL(objectUrl)
            }
        }
    }, [id, body, source, mimeType])

    return { error, loading, src }
}

// === useScaledDimensions hook ===
// This hook scales images using our scaleAttachment function
// and then stores the dimensions in a cache to improve performance
// on the next render.
interface UseScaledDimensionsParams {
    id: string
    originalWidth: number
    originalHeight: number
    containerRef: RefObject<HTMLElement | null>
}

interface Dimensions {
    width: number
    height: number
}

const cache = new Map<string, Dimensions>()

export function useScaledDimensions({
    id,
    originalWidth,
    originalHeight,
    containerRef,
}: UseScaledDimensionsParams) {
    const [containerWidth, setContainerWidth] = useState<number>(0)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        setContainerWidth(el.clientWidth)
    }, [containerRef])

    const dimensions = useMemo(() => {
        if (!containerWidth) return { width: 0, height: 0 }

        const cached = cache.get(id)
        if (cached) return cached

        const { width, height } = scaleAttachment(
            originalWidth,
            originalHeight,
            containerWidth,
            400,
        )

        const result = { width, height }
        cache.set(id, result)
        return result
    }, [id, containerWidth, originalWidth, originalHeight])

    return dimensions
}
