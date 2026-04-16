import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import welcomeBackground from '@fedi/common/assets/images/welcome-bg.png'
import FediLogo from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { Button } from '../components/Button'
import { Column } from '../components/Flex'
import { Text } from '../components/Text'
import { useDeviceQuery } from '../hooks'
import { styled, theme } from '../styles'
import { getDeepLinkPath, getHashParams } from '../utils/linking'

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

    useEffect(() => {
        if (typeof window === 'undefined' || isMobile === undefined) return

        if (!isMobile) {
            replace(getDeepLinkPath(window.location.href))
            return
        }

        const href = window.location.href
        const parsedUrl = new URL(href)
        const queryParams = new URLSearchParams(parsedUrl.search)
        const hashParams = getHashParams(parsedUrl.hash)

        if (!queryParams.has('screen') && !('screen' in hashParams)) {
            replace('/')
            return
        }

        setLoaded(true)
    }, [isMobile, replace])

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

    if (!loaded) return null

    return (
        <Page>
            <Container>
                <Hero
                    css={{
                        backgroundImage: `url(${welcomeBackground.src})`,
                        backgroundPosition: 'center -80px',
                        backgroundSize: 'cover',
                    }}>
                    <Column center>
                        <FediLogo width={50} />
                        <Text variant="h2" weight="medium">
                            {t('feature.onboarding.fedi')}
                        </Text>
                    </Column>
                </Hero>
                <ActionArea>
                    <ActionTitle>
                        {t('feature.onboarding.web-link-page-headline')}
                    </ActionTitle>
                    <StepCard>
                        <StepNum>1</StepNum>
                        <Button width="full" onClick={handleDownloadApp}>
                            {t(
                                'feature.onboarding.web-link-page-primary-button-text',
                            )}
                        </Button>
                    </StepCard>
                    <NoticeCard>
                        <StepNumAlert>2</StepNumAlert>
                        <NoticeText>
                            {t('feature.onboarding.web-link-page-return-hint')}
                        </NoticeText>
                        <StepNumAlert>!</StepNumAlert>
                    </NoticeCard>
                    <StepCard>
                        <StepNum>3</StepNum>
                        <Button
                            width="full"
                            variant="secondary"
                            onClick={handleOpenInFedi}>
                            {t(
                                'feature.onboarding.web-link-page-continue-button-text',
                            )}
                        </Button>
                    </StepCard>
                </ActionArea>
            </Container>
        </Page>
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
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    padding: `${theme.spacing.xxl} 0`,
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

const ActionArea = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: theme.spacing.md,
    padding: `0 20px 32px`,
})

const ActionTitle = styled('p', {
    margin: 0,
    fontSize: 17,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
})

const stepNumBase = {
    width: 30,
    minWidth: 30,
    height: 30,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.bolder,
}

const StepCard = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: 16,
    padding: `${theme.spacing.lg} 20px`,
    background: theme.colors.grey100,
})

const StepNum = styled('span', {
    ...stepNumBase,
    background: theme.colors.extraLightGrey,
    color: theme.colors.darkGrey,
})

const NoticeCard = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: 16,
    padding: `${theme.spacing.lg} 20px`,
    background: `linear-gradient(135deg, #FFF5F2 0%, #FFE8E2 100%)`,
    border: '1.5px solid #FFD4C8',
})

const StepNumAlert = styled('span', {
    ...stepNumBase,
    background: '#FFD4C8',
    color: theme.colors.red,
})

const NoticeText = styled('span', {
    flex: 1,
    fontSize: 15,
    fontWeight: theme.fontWeights.bolder,
    color: theme.colors.red,
    lineHeight: 1.35,
    textAlign: 'center',
})

export default LinkingPage
