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

import { Button } from '../components/Button'
import { Column } from '../components/Flex'
import { HorizontalLine } from '../components/HorizontalLine'
import * as Layout from '../components/Layout'
import { Text } from '../components/Text'
import { useDeviceQuery } from '../hooks'
import { styled, theme } from '../styles'
import { getDeepLinkPath, getHashParams } from '../utils/linking'

/*
 * Deeplinking flow for new users (via web)
 * 1. User visits Fedi deeplink e.g. /link?screen=join&id=fed1... (this is a deeplink to join a federation)
 * 2. User clicks Open Link button on /link page (they choose not to install native app)
 * 3. User redirected to /onboarding/join?id=fed1... (but user has not onboarded)
 * 4. User redirected to Welcome/Splash page  /#screen=onboarding%2Fjoin&id=fed1... (preserving the url params)
 * 5. When user clicks Get started button on Welcome/Splash page, read url params and redirect to /onboarding/join?id=fed1...
 */

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
        }

        setLoaded(true)
    }, [isMobile, replace])

    const handleInApp = () => {
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

    const handleInBrowser = () => {
        replace(getDeepLinkPath(window.location.href))
    }

    if (!loaded) return null

    return (
        <Page>
            <Container>
                <Layout.Root>
                    <Layout.Content fullWidth>
                        <Content grow>
                            <Top
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
                                    <Text variant="body">
                                        {t('feature.onboarding.tagline')}
                                    </Text>
                                </Column>
                            </Top>
                            <Bottom gap="md">
                                <Text>
                                    {t(
                                        'feature.onboarding.web-link-page-description',
                                    )}
                                </Text>
                            </Bottom>
                        </Content>
                    </Layout.Content>
                    <Layout.Actions>
                        <Column gap="xs" fullWidth>
                            <Button width="full" onClick={handleInApp}>
                                {t(
                                    'feature.onboarding.web-link-page-primary-button-text',
                                )}
                            </Button>
                            <HorizontalLine text="or" />
                            <Button
                                width="full"
                                variant="secondary"
                                onClick={handleInBrowser}>
                                {t(
                                    'feature.onboarding.web-link-page-secondary-button-text',
                                )}
                            </Button>
                        </Column>
                    </Layout.Actions>
                </Layout.Root>
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

const Content = styled(Column, {
    background: '#F8F8F8',
})

const Top = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',

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

const Bottom = styled(Column, {
    background: theme.colors.white,
    padding: theme.spacing.lg,
    height: 60,
    overflow: 'hidden',
})

export default LinkingPage
