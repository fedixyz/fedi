import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FEDI_PREFIX } from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { CenteredBody, PageShell } from '../components/DeeplinkPageLayout'
import { Icon } from '../components/Icon'
import { Text } from '../components/Text'
import { styled, theme } from '../styles'
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

    return (
        <PageShell>
            <CenteredBody>
                <Icon
                    size={'xl'}
                    icon="FediLogoDark"
                    style={{ transform: 'translateY(30px)' }}
                />

                <Text weight="medium">{titleTextMap[state]}</Text>

                <Button
                    style={{ margin: 0 }}
                    onClick={redirectToFediApp}
                    css={{
                        justifyContent: 'center',
                        visibility: state === 'loading' ? 'hidden' : 'visible',
                        pointerEvents: state === 'loading' ? 'none' : 'auto',
                    }}>
                    <Text weight="medium" css={{ color: theme.colors.white }}>
                        {buttonLabelMap[state]}
                    </Text>
                </Button>
            </CenteredBody>
        </PageShell>
    )
}

ResumePage.noProviders = true

const Button = styled('button', {
    width: '100%',
    maxWidth: 340,
    border: 'none',
    display: 'flex',
    borderRadius: 30,
    cursor: 'pointer',
    alignItems: 'center',
    background: '#1E1E1E',
    transition: 'opacity 0.2s',
    padding: '12px 20px 12px 12px',
    '&:active': {
        opacity: 0.8,
    },
})

export default ResumePage
