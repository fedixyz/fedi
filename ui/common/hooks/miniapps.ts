import { useState } from 'react'

import { useDebouncedEffect } from '@fedi/common/hooks/util'
import { tryFetchUrlMetadata } from '@fedi/common/utils/fedimods'
import { makeLog } from '@fedi/common/utils/log'
import { constructUrl } from '@fedi/common/utils/neverthrow'
import { sanitizeTitle } from '@fedi/common/utils/strings'

const log = makeLog('useValidateMiniAppUrl')

export default function useValidateMiniAppUrl() {
    const [url, setUrl] = useState('')
    const [title, setTitle] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [isFetching, setIsFetching] = useState(false)
    const [isValidUrl, setIsValidUrl] = useState(false)

    useDebouncedEffect(
        () => {
            if (url) {
                constructUrl(/^https?:\/\//i.test(url) ? url : `https://${url}`)
                    // If URL construction fails, setIsValidUrl to false
                    .orTee(() => setIsValidUrl(false))
                    // Otherwise, set valid url and start fetching
                    .andTee(() => {
                        setIsValidUrl(true)
                        setIsFetching(true)
                    })
                    .asyncAndThen(tryFetchUrlMetadata)
                    .match(
                        metadata => {
                            const sanitizedTitle = sanitizeTitle(metadata.title)
                            setTitle(`${sanitizedTitle}`)
                            setImageUrl(metadata.icon)
                            setIsFetching(false)
                        },
                        e => {
                            log.error('Failed to fetch mini app metadata', e)
                            setIsFetching(false)
                        },
                    )
            }
        },
        [url],
        500,
    )

    const canSave =
        isValidUrl && title && url && title.length >= 3 && title.length <= 24

    return {
        url,
        setUrl,
        title,
        setTitle,
        imageUrl,
        setImageUrl,
        isFetching,
        canSave,
    }
}
