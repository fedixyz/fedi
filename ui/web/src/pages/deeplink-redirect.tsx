import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FEDI_PREFIX } from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { Button } from '../components/Button'
import { Column } from '../components/Flex'
import { Icon } from '../components/Icon'
import { Text } from '../components/Text'
import { theme } from '../styles'
import { clearPendingDeeplink, getPendingDeeplink } from '../utils/localstorage'

type PageState = 'loading' | 'found' | 'not_found'

function ResumePage() {
    const { t } = useTranslation()
    const [uri, setUri] = useState<string | null>(null)
    const [state, setState] = useState<PageState>('loading')

    const titleTextMap: Record<PageState, string> = {
        found: t('feature.onboarding.landing-page-activated'),
        loading: t('feature.onboarding.landing-page-activating'),
        not_found: t('feature.onboarding.landing-page-error-title'),
    }

    const buttonLabelMap: Record<PageState, string> = {
        found: t('feature.onboarding.landing-page-found-cta'),
        loading: t('feature.onboarding.landing-page-found-cta'),
        not_found: t('feature.onboarding.landing-page-error-cta'),
    }

    // Brief delay so fast localStorage reads do not flash "Activating…" before resolved state
    useEffect(() => {
        const pending = getPendingDeeplink()
        const normalized = pending ? normalizeDeepLink(pending) : null
        const timer = setTimeout(() => {
            setState(normalized ? 'found' : 'not_found')
            setUri(normalized?.fediUri || FEDI_PREFIX)
        }, 1000)
        return () => clearTimeout(timer)
    }, [])

    const redirectToFediApp = () => {
        if (!uri) return
        clearPendingDeeplink()
        window.location.href = uri
    }

    const isLoading = state === 'loading'

    return (
        <Column style={{ height: '100dvh' }}>
            <Column center grow gap="md">
                <Icon size={'lg'} icon="FediLogoDark" />

                <Text weight="medium">{titleTextMap[state]}</Text>

                <Button
                    width="full"
                    onClick={redirectToFediApp}
                    css={{
                        maxWidth: 340,
                        background: theme.colors.night,
                        fontSize: 16,
                        fontWeight: 500,
                        visibility: isLoading ? 'hidden' : 'visible',
                        pointerEvents: isLoading ? 'none' : 'auto',
                    }}>
                    {buttonLabelMap[state]}
                </Button>
            </Column>
        </Column>
    )
}

ResumePage.noProviders = true

export default ResumePage
