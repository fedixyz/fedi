import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { Button } from '../components/Button'
import {
    DeeplinkHeroLayout,
    getLinkActionText,
    PageShell,
} from '../components/DeeplinkPageLayout'
import { Column } from '../components/Flex'
import { Text } from '../components/Text'
import { useDeviceQuery } from '../hooks'
import { keyframes, styled, theme } from '../styles'
import { getDeepLinkPath } from '../utils/linking'
import { setPendingDeeplink } from '../utils/localstorage'

/*
 * Deeplinking flow for new users (via web)
 * 1. User visits Fedi deeplink e.g. /link?screen=join&id=fed1... (this is a deeplink to join a federation)
 * 2. Page attempts to open the native app via fedi:// custom scheme
 * 3. If the app is not installed, user downloads it from the app store
 * 4. User returns to this page and clicks Open link in Fedi to replay the deeplink
 */

const openDeepLinkInFedi = (href: string) => {
    const normalized = normalizeDeepLink(href)
    if (!normalized) return

    window.location.href = normalized.fediUri
}

const LinkingPage: NextPage = () => {
    const { t } = useTranslation()
    const { replace } = useRouter()
    const { isMobile } = useDeviceQuery()

    const [loaded, setLoaded] = useState(false)
    const [clickCount, setClickCount] = useState(0)
    const [linkActionText, setLinkActionText] = useState(
        t('feature.onboarding.landing-page-cta'),
    )

    useEffect(() => {
        if (typeof window === 'undefined' || isMobile === undefined) return

        if (!isMobile) {
            replace(getDeepLinkPath(window.location.href))
            return
        }

        const href = window.location.href
        const normalized = normalizeDeepLink(href)

        if (!normalized) {
            replace('/')
            return
        }

        setPendingDeeplink(href)
        setLinkActionText(getLinkActionText(normalized, t))
        setLoaded(true)
    }, [isMobile, replace, t])

    // On mobile, attempt to open the app via fedi:// custom scheme.
    // This handles the case where Android App Links auto-verification
    // failed but the app is installed — the custom scheme doesn't
    // require domain verification. If the app isn't installed, this
    // silently fails and the user stays on this page.
    useEffect(() => {
        if (!loaded || !isMobile) return

        openDeepLinkInFedi(window.location.href)
    }, [loaded, isMobile])

    const handleDownloadApp = () => {
        const ua = window.navigator.userAgent || ''

        if (/iPhone|iPad|iPod/i.test(ua)) {
            window.open(IOS_APP_STORE_URL, '_blank')
        } else if (/Android/i.test(ua)) {
            window.open(
                `${ANDROID_PLAY_STORE_URL}&referrer=${encodeURIComponent(window.location.href)}`,
                '_blank',
            )
        }
    }

    const handleOpenInFedi = () => {
        openDeepLinkInFedi(window.location.href)
    }

    const handleStepClick = () => {
        handleOpenInFedi()
        setClickCount(c => c + 1)
    }

    const showDownloadCta = clickCount >= 2
    const shouldWiggle = clickCount >= 3

    if (!loaded) return null

    return (
        <>
            <PageShell>
                <DeeplinkHeroLayout
                    stepLabel={linkActionText}
                    onStepClick={handleStepClick}>
                    <Column
                        center
                        css={{
                            gap: theme.spacing.md,
                            marginTop: 16,
                            visibility: showDownloadCta ? 'visible' : 'hidden',
                        }}
                        aria-hidden={!showDownloadCta}>
                        <Text variant="tiny" weight="medium" center>
                            {t('feature.onboarding.landing-page-modal-title')}
                        </Text>
                        <Button
                            key={
                                shouldWiggle ? `wiggle-${clickCount}` : 'static'
                            }
                            variant="outline"
                            onClick={handleDownloadApp}
                            css={
                                shouldWiggle
                                    ? {
                                          animation: `${wiggle} 0.4s ease-in-out`,
                                          borderColor: theme.colors.blue,
                                      }
                                    : undefined
                            }>
                            <Text
                                variant="caption"
                                weight="medium"
                                css={
                                    shouldWiggle
                                        ? { color: theme.colors.blue }
                                        : undefined
                                }>
                                {t(
                                    'feature.onboarding.landing-page-modal-description',
                                )}
                            </Text>
                        </Button>
                        <Text
                            variant="tiny"
                            weight="medium"
                            center
                            css={{
                                color: theme.colors.red,
                            }}>
                            <Trans
                                i18nKey="feature.onboarding.landing-page-fallback-instruction"
                                values={{ cta: linkActionText }}
                                components={{
                                    bold: <RedBold />,
                                }}
                            />
                        </Text>
                    </Column>
                </DeeplinkHeroLayout>
            </PageShell>
        </>
    )
}

// Means we don't load bridge so page can load fast
LinkingPage.noProviders = true

const RedBold = styled('span', {
    fontWeight: 600,
})

const wiggle = keyframes({
    '0%, 100%': { transform: 'translateX(0)' },
    '25%': { transform: 'translateX(-8px)' },
    '50%': { transform: 'translateX(8px)' },
    '75%': { transform: 'translateX(-4px)' },
})

export default LinkingPage
