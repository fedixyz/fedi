import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import FediLogo from '@fedi/common/assets/svgs/fedi-logo.svg'
import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { Column } from '../components/Flex'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
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
    const [showModal, setShowModal] = useState(false)

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
        setShowModal(false)
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
        <>
            <Page>
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
                            <FediLogo width={100} />
                            <Text variant="body">
                                {t('feature.onboarding.tagline')}
                            </Text>
                        </Column>
                    </Hero>
                    <Column
                        center
                        css={{
                            gap: theme.spacing.xl,
                            padding: theme.spacing.lg,
                        }}>
                        <Text>
                            {t('feature.onboarding.landing-page-title')}
                        </Text>
                        <Step step="one" onClick={() => setShowModal(true)}>
                            <StepNo>
                                <Text weight="bold" variant="caption">
                                    1
                                </Text>
                            </StepNo>
                            <Column grow>
                                <Text
                                    weight="bold"
                                    css={{ color: theme.colors.white }}>
                                    {t(
                                        'feature.onboarding.landing-page-step-1-title',
                                    )}
                                </Text>
                                <Text
                                    variant="caption"
                                    css={{ color: theme.colors.lightGrey }}>
                                    {t(
                                        'feature.onboarding.landing-page-step-1-description',
                                    )}
                                </Text>
                            </Column>
                            <Icon icon="ArrowRight" size="sm" color="white" />
                        </Step>
                        <Step step="two" onClick={handleOpenInFedi}>
                            <StepNo invert>
                                <Text weight="bold" variant="caption">
                                    2
                                </Text>
                            </StepNo>
                            <Column grow>
                                <Text
                                    weight="bold"
                                    css={{ color: theme.colors.black }}>
                                    {t(
                                        'feature.onboarding.landing-page-step-2-title',
                                    )}
                                </Text>
                                <Text
                                    variant="caption"
                                    css={{ color: theme.colors.darkGrey }}>
                                    {t(
                                        'feature.onboarding.landing-page-step-2-description',
                                    )}
                                </Text>
                            </Column>
                            <Icon icon="ArrowRight" size="sm" color="black" />
                        </Step>
                    </Column>
                </Container>
            </Page>

            <Modal
                open={showModal}
                onOpenChange={() => setShowModal(false)}
                buttonText={t('phrases.i-understand')}
                onClick={handleDownloadApp}>
                <Column center css={{ padding: `0 ${theme.spacing.xl}` }}>
                    <Icon icon="AlertWarningTriangle" size="md" />
                    <Text variant="h2" weight="medium">
                        {t('feature.onboarding.landing-page-modal-title')}
                    </Text>
                    <Text variant="body">
                        {t('feature.onboarding.landing-page-modal-description')}
                    </Text>
                </Column>
            </Modal>
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
    height: '45dvh',
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
    border: `1px solid transparent`,
    borderRadius: 16,
    cursor: 'pointer',
    display: 'flex',
    gap: theme.spacing.md,
    height: 60,
    padding: theme.spacing.md,
    position: 'relative',
    width: '100%',

    '&:not(:last-child)::after': {
        content: '""',
        backgroundColor: theme.colors.lightGrey,
        position: 'absolute',
        left: 30,
        top: '100%',
        marginTop: 7,
        height: 12,
        width: 1,
    },

    variants: {
        step: {
            one: {
                background: `linear-gradient(${theme.colors.white20}, transparent), linear-gradient(${theme.colors.primary}, ${theme.colors.primary})`,
            },
            two: {
                background: theme.colors.white,
                borderColor: theme.colors.extraLightGrey,
            },
        },
    },
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
