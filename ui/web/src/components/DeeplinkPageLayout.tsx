import { TFunction } from 'i18next'
import { Poppins } from 'next/font/google'
import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { styled, theme } from '../styles'
import { Column } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

export const poppins = Poppins({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-poppins',
    display: 'swap',
})

export const Page = styled('div', {
    overflow: 'hidden',
    width: '100%',
})

export const Container = styled('div', {
    background: theme.colors.white,
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    margin: '0 auto',
    maxWidth: 480,
    minHeight: 0,
})

export const Hero = styled('div', {
    alignItems: 'center',
    background: '#F8F8F8',
    display: 'flex',
    height: '25dvh',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',

    '&::after': {
        backgroundColor: theme.colors.white,
        borderRadius: '50%',
        bottom: '-60px',
        content: '""',
        height: '80px',
        left: '50%',
        position: 'absolute',
        transform: 'translateX(-50%)',
        width: '120%',
    },
})

export const Step = styled('div', {
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

export const StepNo = styled('span', {
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

export function PageShell({
    children,
    className = poppins.variable,
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <Page className={className}>
            <Container>{children}</Container>
        </Page>
    )
}

const heroGradient =
    'linear-gradient(to bottom, rgba(229,229,229,0) 0%, rgba(229,229,229,0) 60%, rgba(229,229,229,0.32) 78%, rgba(229,229,229,0.68) 100%), radial-gradient(circle 260px at center, transparent 158px, white 158px, white 208px, transparent 208px)'

export function DeeplinkHeroLayout({
    stepLabel,
    onStepClick,
    children,
}: {
    stepLabel: string
    onStepClick: () => void
    children?: ReactNode
}) {
    const { t } = useTranslation()
    return (
        <>
            <Hero
                css={{
                    backgroundPosition: 'center center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: 'cover',
                    backgroundImage: heroGradient,
                }}>
                <Column center gap="md">
                    <Icon icon="FediLogo" size={120} />
                </Column>
            </Hero>
            <Column
                center
                grow
                css={{ padding: theme.spacing.lg, justifyContent: 'center' }}>
                <Text
                    variant="caption"
                    weight="normal"
                    css={{ color: theme.colors.black }}>
                    {t('feature.onboarding.landing-page-title')}
                </Text>
                <Step onClick={onStepClick} css={{ marginTop: 13 }}>
                    <StepNo>
                        <Icon icon="ExternalLink" size="sm" color="white" />
                    </StepNo>
                    <Text
                        variant="caption"
                        weight="medium"
                        css={{ color: theme.colors.white }}>
                        {stepLabel}
                    </Text>
                    <Column grow />
                    <Icon icon="ArrowRight" size="sm" color="white" />
                </Step>
                {children}
            </Column>
        </>
    )
}

type Normalized = NonNullable<ReturnType<typeof normalizeDeepLink>>

export function getLinkActionText(
    normalized: Normalized,
    t: TFunction,
): string {
    const { screen, params } = normalized

    switch (screen) {
        case 'join': {
            const invite = (
                params.get('invite') ??
                params.get('id') ??
                ''
            ).toLowerCase()
            const isCommunityInvite =
                invite.startsWith('community') ||
                invite.startsWith('fedi:community')
            return isCommunityInvite
                ? t('feature.onboarding.landing-page-cta')
                : `${t('words.join')} ${t('words.wallet')}`
        }
        case 'ecash':
            return t('feature.ecash.claim-ecash')
        case 'chat':
        case 'room':
            return t('feature.chat.open-chat')
        default:
            return t('feature.onboarding.landing-page-cta')
    }
}

export function CenteredBody({ children }: { children: ReactNode }) {
    return (
        <Column
            center
            css={{
                flex: 1,
                gap: theme.spacing.xl,
                justifyContent: 'center',
                padding: theme.spacing.lg,
            }}>
            {children}
        </Column>
    )
}
