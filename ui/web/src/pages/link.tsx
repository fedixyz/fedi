import { TFunction } from 'i18next'
import type { NextPage } from 'next'
import { Poppins } from 'next/font/google'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { Button } from '../components/Button'
import { Column } from '../components/Flex'
import { Icon } from '../components/Icon'
import { Text } from '../components/Text'
import { useDeviceQuery } from '../hooks'
import { keyframes, styled, theme } from '../styles'
import { getDeepLinkPath } from '../utils/linking'

/*
 * Deeplinking flow for new users (via web)
 * 1. User visits Fedi deeplink e.g. /link?screen=join&id=fed1... (this is a deeplink to join a federation)
 * 2. Page attempts to open the native app via fedi:// custom scheme
 * 3. If the app is not installed, user downloads it from the app store
 * 4. User returns to this page and clicks Open link in Fedi to replay the deeplink
 */

const poppins = Poppins({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-poppins',
    display: 'swap',
})

const openDeepLinkInFedi = (href: string) => {
    const normalized = normalizeDeepLink(href)
    if (!normalized) return

    window.location.href = normalized.fediUri
}

type Normalized = NonNullable<ReturnType<typeof normalizeDeepLink>>

const getLinkActionText = (normalized: Normalized, t: TFunction): string => {
    const { screen, params } = normalized
    const invite = (
        params.get('invite') ??
        params.get('id') ??
        ''
    ).toLowerCase()
    const isCommunityInvite =
        invite.startsWith('community') || invite.startsWith('fedi:community')

    switch (screen) {
        case 'join':
            return isCommunityInvite
                ? t('feature.onboarding.landing-page-cta')
                : `${t('words.join')} ${t('words.wallet')}`
        case 'ecash':
            return t('feature.ecash.claim-ecash')
        case 'chat':
        case 'room':
            return t('feature.chat.open-chat')
        default:
            return t('feature.onboarding.landing-page-cta')
    }
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
            <Page className={poppins.variable}>
                <Container>
                    <Hero
                        css={{
                            backgroundPosition: 'center center',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: 'cover',
                            backgroundImage:
                                'linear-gradient(to bottom, rgba(229,229,229,0) 0%, rgba(229,229,229,0) 60%, rgba(229,229,229,0.32) 78%, rgba(229,229,229,0.68) 100%), radial-gradient(circle 260px at center, transparent 158px, white 158px, white 208px, transparent 208px)',
                        }}>
                        <Column center gap="md">
                            <Icon icon="FediLogo" size={120} />
                        </Column>
                    </Hero>
                    <Column
                        center
                        grow
                        css={{
                            padding: theme.spacing.lg,
                            justifyContent: 'center',
                        }}>
                        <Text
                            variant="caption"
                            weight="normal"
                            css={{ color: theme.colors.black }}>
                            {t('feature.onboarding.landing-page-title')}
                        </Text>
                        <Step onClick={handleStepClick} css={{ marginTop: 13 }}>
                            <StepNo>
                                <Icon
                                    icon="ExternalLink"
                                    size="sm"
                                    color="white"
                                />
                            </StepNo>
                            <Text
                                variant="caption"
                                weight="medium"
                                css={{ color: theme.colors.white }}>
                                {linkActionText}
                            </Text>
                            <Column grow></Column>
                            <Icon icon="ArrowRight" size="sm" color="white" />
                        </Step>

                        <Column
                            center
                            css={{
                                gap: theme.spacing.md,
                                marginTop: 16,
                                visibility: showDownloadCta
                                    ? 'visible'
                                    : 'hidden',
                            }}
                            aria-hidden={!showDownloadCta}>
                            <Text variant="tiny" weight="medium" center>
                                {t(
                                    'feature.onboarding.landing-page-modal-title',
                                )}
                            </Text>
                            <Button
                                key={
                                    shouldWiggle
                                        ? `wiggle-${clickCount}`
                                        : 'static'
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
                                    color: 'var(--Red-Red-600, #E00A00)',
                                }}>
                                then click <RedBold>{linkActionText}!</RedBold>
                            </Text>
                        </Column>
                    </Column>
                </Container>
            </Page>
        </>
    )
}

// Means we don't load bridge so page can load fast
LinkingPage.noProviders = true

const Page = styled('div', {
    overflow: 'hidden',
    width: '100%',
})

const Container = styled('div', {
    background: theme.colors.white,
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    margin: '0 auto',
    minHeight: 0,
    maxWidth: 480,
})

const Hero = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: '25dvh',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    background: '#F8F8F8',

    '&::after': {
        content: '""',
        position: 'absolute',
        bottom: '-60px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '120%',
        height: '80px',
        backgroundColor: theme.colors.white,
        borderRadius: '50%',
    },
})

const Step = styled('div', {
    alignItems: 'center',
    alignSelf: 'stretch',
    background: `linear-gradient(180deg, ${theme.colors.white20} -30.21%, transparent 100%), ${theme.colors.night}`,
    border: `1px solid ${theme.colors.dividerGrey}`,
    borderRadius: 20,
    cursor: 'pointer',
    display: 'flex',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    width: '100%',
})

const RedBold = styled('span', {
    fontWeight: 600,
})

const wiggle = keyframes({
    '0%, 100%': { transform: 'translateX(0)' },
    '25%': { transform: 'translateX(-8px)' },
    '50%': { transform: 'translateX(8px)' },
    '75%': { transform: 'translateX(-4px)' },
})

const StepNo = styled('span', {
    alignItems: 'center',
    background: theme.colors.black,
    borderRadius: '50%',
    color: theme.colors.white,
    display: 'flex',
    height: 36,
    justifyContent: 'center',
    width: 36,

    variants: {
        invert: {
            true: {
                background: theme.colors.lightGrey,
                color: theme.colors.darkGrey,
            },
        },
    },
})

export default LinkingPage
