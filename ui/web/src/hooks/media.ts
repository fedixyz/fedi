import { useEffect, useState } from 'react'

import { MatrixEvent } from '@fedi/common/types'
import { JSONObject } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { fedimint, readBridgeFile } from '../lib/bridge/'

const log = makeLog('useLoadMedia')

export function useLoadMedia(
    event: MatrixEvent<
        MatrixEventContentType<'m.video' | 'm.image' | 'm.file'>
    >,
) {
    const [src, setSrc] = useState<string | null>(null)
    const [loading, setLoading] = useState<boolean>(false)
    const [error, setError] = useState<boolean>(false)

    useEffect(() => {
        let url: string | null = null

        const loadMedia = async () => {
            setLoading(true)
            try {
                if (event.content.file === null) return
                const { body, file } = event.content

                const mediaPath = await fedimint.matrixDownloadFile(
                    body,
                    typeof file === 'string'
                        ? { url: file }
                        : { file: file as JSONObject },
                )

                const result = await readBridgeFile(mediaPath)
                url = URL.createObjectURL(
                    new Blob([result], { type: event.content.info.mimetype }),
                )

                setSrc(url)
            } catch {
                log.error('failed to load media')
                setError(true)
            } finally {
                setLoading(false)
            }
        }

        loadMedia()

        return () => {
            url && URL.revokeObjectURL(url)
        }
    }, [event.content])

    return { error, loading, src }
}
