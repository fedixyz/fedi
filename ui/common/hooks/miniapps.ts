import { useState } from 'react'

import { useDebouncedEffect } from '@fedi/common/hooks/util'
import { tryFetchUrlMetadata } from '@fedi/common/utils/fedimods'
import { makeLog } from '@fedi/common/utils/log'
import { constructUrl } from '@fedi/common/utils/neverthrow'
import { sanitizeTitle } from '@fedi/common/utils/strings'

const log = makeLog('useValidateMiniAppUrl')

export const DEBOUNCE_MS = 500
export const MIN_TITLE_LENGTH = 3
export const MAX_TITLE_LENGTH = 24

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
        DEBOUNCE_MS,
    )

    const canSave =
        isValidUrl &&
        title &&
        url &&
        title.length >= MIN_TITLE_LENGTH &&
        title.length <= MAX_TITLE_LENGTH

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
