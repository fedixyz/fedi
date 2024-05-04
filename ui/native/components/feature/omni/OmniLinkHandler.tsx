import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useOmniLinkContext } from '../../../state/contexts/OmniLinkContext'
import { OmniConfirmation } from './OmniConfirmation'

export const OmniLinkHandler: React.FC = () => {
    const { t } = useTranslation()
    const { parsedLink, setParsedLink } = useOmniLinkContext()

    const clearParsedLink = useCallback(
        () => setParsedLink(null),
        [setParsedLink],
    )

    if (!parsedLink) return null

    return (
        <OmniConfirmation
            parsedData={parsedLink}
            goBackText={t('words.cancel')}
            onGoBack={clearParsedLink}
            onSuccess={clearParsedLink}
        />
    )
}
