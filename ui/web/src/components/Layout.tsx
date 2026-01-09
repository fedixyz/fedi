import { useRouter } from 'next/router'
import React, { useState } from 'react'

import ChevronLeft from '@fedi/common/assets/svgs/chevron-left.svg'
import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import { Community } from '@fedi/common/types'

import { keyframes, styled, theme } from '../styles'
import { CommunityInviteDialog } from './CommunityInviteDialog'
import { Column, Row } from './Flex'
import { Icon } from './Icon'
import MainHeaderButtons from './MainHeaderButtons'
import SelectedCommunity from './SelectedCommunity'
import { ShadowScroller } from './ShadowScroller'
import { TotalBalance } from './TotalBalance'

type PageHeaderProps = {
    title: string
    onAddPress?: () => void
    onShowCommunitiesPress?: () => void
    selectedCommunity?: Community
}

export function PageHeader({
    title,
    onAddPress,
    onShowCommunitiesPress,
    selectedCommunity,
}: PageHeaderProps) {
    const [invitingCommunityId, setInvitingCommunityId] = useState('')

    return (
        <>
            <PageHeaderContainer>
                <PageHeaderGradient justify="between" align="start" gap="xs">
                    <Row justify="between" css={{ width: '100%' }}>
                        <Title>{title}</Title>
                        <MainHeaderButtons
                            onShowCommunitiesPress={onShowCommunitiesPress}
                            onAddPress={onAddPress}
                        />
                    </Row>
                    <TotalBalance />
                </PageHeaderGradient>
                {selectedCommunity && (
                    <SelectedCommunityWrapper>
                        <SelectedCommunity
                            community={selectedCommunity}
                            onQrClick={() =>
                                setInvitingCommunityId(selectedCommunity.id)
                            }
                        />
                    </SelectedCommunityWrapper>
                )}
            </PageHeaderContainer>
            <CommunityInviteDialog
                open={!!invitingCommunityId}
                communityId={invitingCommunityId}
                onClose={() => setInvitingCommunityId('')}
            />
        </>
    )
}

const PageHeaderContainer = styled('div', {})

const PageHeaderGradient = styled(Column, {
    fediGradient: 'sky',
    padding: '10px 20px',
})

const SelectedCommunityWrapper = styled('div', {
    borderBottom: `1px solid ${theme.colors.extraLightGrey}`,
    padding: '10px 20px',
})

type HeaderProps = {
    back?: string | boolean
    showCloseButton?: boolean
    centered?: boolean
    rightComponent?: React.ReactElement
}

export function Header({
    children,
    back,
    showCloseButton,
    centered,
    rightComponent,
    ...props
}: React.ComponentProps<typeof HeaderContainer> & HeaderProps) {
    const router = useRouter()

    return (
        <HeaderContainer {...props}>
            <Row fullWidth align="center">
                {back && (
                    <LeftComponentWrapper>
                        <Icon
                            icon={ChevronLeft}
                            size="sm"
                            onClick={
                                // provide string to specify next route on back
                                // or provide boolean to call router history back
                                typeof back === 'string'
                                    ? () => router.push(back)
                                    : () => router.back()
                            }
                        />
                    </LeftComponentWrapper>
                )}

                <HeaderContent centered={centered}>{children}</HeaderContent>

                <RightComponentWrapper>
                    {showCloseButton ? (
                        <Icon icon={CloseIcon} onClick={() => router.back()} />
                    ) : rightComponent ? (
                        rightComponent
                    ) : null}
                </RightComponentWrapper>
            </Row>
        </HeaderContainer>
    )
}

export const Root = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
})

export const HeaderContainer = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: 64,
    position: 'relative',
    width: '100%',
})

export const LeftComponentWrapper = styled('div', {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    left: theme.spacing.md,
    justifyContent: 'center',
    position: 'absolute',
})

export const RightComponentWrapper = styled('div', {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'center',
    position: 'absolute',
    right: theme.spacing.md,
})

const HeaderContent = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    justifyContent: 'space-between',
    gap: 8,
    height: '100%',
    width: '100%',
    padding: '0 16px',

    variants: {
        centered: {
            true: {
                justifyContent: 'center',
            },
        },
    },
})

export const Title = styled('h1', {
    fontSize: theme.fontSizes.h2,
    fontWeight: theme.fontWeights.medium,
    lineHeight: 1.5,

    variants: {
        small: {
            true: {
                fontSize: theme.fontSizes.h2,
                fontWeight: theme.fontWeights.medium,
            },
        },
        subheader: {
            true: {
                fontSize: theme.fontSizes.body,
                fontWeight: theme.fontWeights.bold,
                flexGrow: 1,
                textAlign: 'center',
            },
        },
    },
})

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

export const Content = styled(ShadowScroller, {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    width: '100%',

    '& > *:first-child': {
        height: '100%',
        overflow: 'auto',
        overscrollBehavior: 'contain',
        '-webkit-overflow-scrolling': 'touch',
    },

    variants: {
        fullWidth: {
            true: {},
            false: {
                '& > *:first-child': {
                    padding: 20,
                },
            },
        },

        centered: {
            true: {
                justifyContent: 'center',

                '& > *:first-child': {
                    height: 'auto',
                },
            },
        },

        fadeIn: {
            true: {
                animation: `${fadeIn} .8s ease`,
            },
        },
    },
    defaultVariants: {
        fullWidth: false,
        centered: false,
    },
})

export const Actions = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    paddingTop: 24,
    gap: 16,
    padding: '24px 24px 24px',

    '@standalone': {
        '.hide-navigation &': {
            '@sm': {
                paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
            },
            '@xs': {
                paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            },
        },
    },
})
