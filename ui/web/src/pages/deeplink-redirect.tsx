import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FEDI_PREFIX } from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import {
    CenteredBody,
    DeeplinkHeroLayout,
    getLinkActionText,
    Hero,
    PageShell,
} from '../components/DeeplinkPageLayout'
import { Column } from '../components/Flex'
import { Icon } from '../components/Icon'
import { Text } from '../components/Text'
import { styled, theme } from '../styles'
import { clearPendingDeeplink, getPendingDeeplink } from '../utils/localstorage'

type PageState = 'loading' | 'not_found'

function ResumePage() {
    const { t } = useTranslation()
    const [state, setState] = useState<PageState>('loading')
    const [fediUri, setFediUri] = useState<string | null>(null)
    const [redirectAttempted, setRedirectAttempted] = useState(false)
    const [linkActionText, setLinkActionText] = useState(
        t('feature.onboarding.landing-page-cta'),
    )

    useEffect(() => {
        const pending = getPendingDeeplink()
        const normalized = pending ? normalizeDeepLink(pending) : null

        if (!normalized) return setState('not_found')

        clearPendingDeeplink()
        setFediUri(normalized.fediUri)
        setLinkActionText(getLinkActionText(normalized, t))
    }, [t])

    useEffect(() => {
        if (fediUri) {
            window.location.href = fediUri
            const timer = setTimeout(() => setRedirectAttempted(true), 2500)
            return () => clearTimeout(timer)
        }
    }, [fediUri])

    const handleOpenInFedi = () => {
        if (fediUri) window.location.href = fediUri
    }

    const handleGoBackToFedi = () => {
        window.location.href = FEDI_PREFIX
    }

    if (state === 'not_found') {
        return (
            <PageShell>
                <Hero
                    css={{
                        height: '38dvh',
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                        background: theme.colors.grey50,
                        backgroundPosition: 'center center',
                        border: `1px solid var(--border-border-light, ${theme.colors.white})`,
                        backgroundImage:
                            'linear-gradient(to bottom, rgba(229,229,229,0) 0%, rgba(229,229,229,0) 60%, rgba(229,229,229,0.32) 78%, rgba(229,229,229,0.68) 100%), radial-gradient(circle 260px at center 25%, transparent 158px, white 158px, white 208px, transparent 208px)',
                    }}>
                    <Icon icon="FediLogo" size={150} />
                </Hero>
                <Column
                    center
                    css={{
                        flexGrow: 1,
                        gap: theme.spacing.md,
                        justifyContent: 'center',
                        padding: theme.spacing.xl,
                    }}>
                    <ErrorIconBadge>
                        <Icon icon="Offline" size="md" color="inherit" />
                    </ErrorIconBadge>
                    <Text variant="h2" weight="medium" center>
                        {t('feature.onboarding.landing-page-error-title')}
                    </Text>
                    <Text
                        variant="caption"
                        center
                        css={{
                            color: theme.colors.darkGrey,
                            marginBottom: theme.spacing.lg,
                        }}>
                        {t('feature.onboarding.landing-page-error-description')}
                    </Text>
                    <GoBackButton
                        onClick={handleGoBackToFedi}
                        css={{ justifyContent: 'center' }}>
                        <Text
                            weight="medium"
                            css={{ color: theme.colors.white }}>
                            {t('feature.onboarding.landing-page-error-cta')}
                        </Text>
                    </GoBackButton>
                </Column>
            </PageShell>
        )
    }

    if (!redirectAttempted) {
        return (
            <PageShell>
                <CenteredBody>
                    <Icon icon="FediLogoIcon" size={40} />
                    <Text weight="medium">
                        {t('feature.onboarding.landing-page-activating')}
                    </Text>
                </CenteredBody>
            </PageShell>
        )
    }

    return (
        <PageShell>
            <DeeplinkHeroLayout
                stepLabel={linkActionText}
                onStepClick={handleOpenInFedi}
            />
        </PageShell>
    )
}

ResumePage.noProviders = true

const GoBackButton = styled('button', {
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

const ErrorIconBadge = styled('div', {
    width: 64,
    height: 64,
    display: 'flex',
    borderRadius: '50%',
    alignItems: 'center',
    background: '#F2F2F2',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    color: theme.colors.darkGrey,
})

export default ResumePage
