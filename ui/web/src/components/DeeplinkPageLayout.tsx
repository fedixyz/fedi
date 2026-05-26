import { Poppins } from 'next/font/google'
import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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

export const Step = styled('div', {
    alignItems: 'center',
    alignSelf: 'stretch',
    border: `1px solid ${theme.colors.dividerGrey}`,
    borderRadius: 20,
    cursor: 'pointer',
    display: 'flex',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    width: '100%',
    height: 65,

    variants: {
        variant: {
            primary: {
                background: `linear-gradient(180deg, ${theme.colors.white20} -30.21%, transparent 100%), ${theme.colors.night}`,
                color: theme.colors.white,
            },
            secondary: {
                background: theme.colors.white,
                color: theme.colors.black,
            },
        },
    },
    defaultVariants: {
        variant: 'primary',
    },
})

export const StepNo = styled('span', {
    alignItems: 'center',
    background: theme.colors.black,
    borderRadius: '50%',
    color: theme.colors.white,
    display: 'flex',
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,

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

export const LogoHeader = styled('div', {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    width: '100%',
})

export function DeeplinkHeroLayout({
    onClick,
    onDownload,
    children,
}: {
    onClick: () => void
    onDownload?: () => void
    children?: ReactNode
}) {
    const { t } = useTranslation()
    return (
        <>
            <LogoHeader>
                <Icon
                    icon="FediLogoHorizontalBlack"
                    size={155}
                    style={{ transform: 'translateX(-15px)' }}
                />
            </LogoHeader>
            <Column
                center
                grow
                css={{
                    padding: theme.spacing.lg,
                    gap: theme.spacing.md,
                    justifyContent: 'center',
                }}>
                <Text
                    variant="body"
                    weight="normal"
                    css={{ color: theme.colors.black }}>
                    {t('feature.onboarding.landing-page-title')}
                </Text>
                {onDownload && (
                    <Step variant="primary" onClick={onDownload}>
                        <StepNo>
                            <Text
                                variant="body"
                                weight="bold"
                                css={{ color: theme.colors.white }}>
                                1
                            </Text>
                        </StepNo>
                        <Text
                            variant="body"
                            weight="medium"
                            css={{ color: theme.colors.white }}>
                            {t('phrases.download-fedi')}
                        </Text>
                        <Column grow />
                        <Icon icon="ChevronRight" size="sm" color="white" />
                    </Step>
                )}
                <Step
                    variant={onDownload ? 'secondary' : 'primary'}
                    onClick={onClick}>
                    <StepNo invert={!!onDownload}>
                        {onDownload ? (
                            <Text
                                variant="body"
                                weight="bold"
                                css={{
                                    color: theme.colors.darkGrey,
                                }}>
                                2
                            </Text>
                        ) : (
                            <Icon icon="ExternalLink" size="sm" color="white" />
                        )}
                    </StepNo>
                    <Text
                        variant="body"
                        weight="normal"
                        css={{
                            color: onDownload
                                ? theme.colors.black
                                : theme.colors.white,
                        }}>
                        {t('phrases.open-in-app')}
                    </Text>
                    <Column grow />
                    <Icon
                        icon="ChevronRight"
                        size="sm"
                        color={onDownload ? 'black' : 'white'}
                    />
                </Step>
                {children}
            </Column>
        </>
    )
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
