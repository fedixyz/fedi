import { useRouter } from 'next/router'
import React from 'react'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import {
    selectMatrixStatus,
    selectLastSelectedCommunity,
} from '@fedi/common/redux'
import { MatrixSyncStatus } from '@fedi/common/types'

import { useAppSelector, useMediaQuery } from '../../hooks'
import { config, styled, theme } from '../../styles'
import { shouldHideNavigation } from '../../utils/nav'
import { ChatOfflineIndicator } from '../Chat/ChatOfflineIndicator'
import { CommunitySelector } from '../CommunitySelector'
import MainHeaderButtons from '../MainHeaderButtons'
import { PageError } from '../PageError'
import SelectedCommunity from '../SelectedCommunity'
import { Navigation } from './Navigation'

interface Props {
    children: React.ReactNode
}

export const Template: React.FC<Props> = ({ children }) => {
    const router = useRouter()
    const { asPath } = router
    const syncStatus = useAppSelector(selectMatrixStatus)
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)

    const isSm = useMediaQuery(config.media.sm)
    const hideNavigation = shouldHideNavigation(asPath, isSm)

    const shouldShowChatOffline =
        syncStatus === MatrixSyncStatus.syncing && asPath.startsWith('/chat')

    const isHome = asPath === '/home'

    const goToJoinCommunity = () => {
        router.push('/onboarding/communities')
    }

    return (
        <Container className={hideNavigation ? 'hide-navigation' : ''}>
            {!hideNavigation && <Navigation />}
            <Content>
                <HeaderArea>
                    {isHome && (
                        <HomeHeader>
                            <HeaderRow>
                                <CommunitySelectorWrapper>
                                    <CommunitySelector />
                                </CommunitySelectorWrapper>
                                <MainHeaderButtons
                                    onAddPress={goToJoinCommunity}
                                />
                            </HeaderRow>
                            {selectedCommunity && (
                                <SelectedCommunity
                                    community={selectedCommunity}
                                />
                            )}
                        </HomeHeader>
                    )}
                </HeaderArea>

                {shouldShowChatOffline && <ChatOfflineIndicator />}

                <Main centered={hideNavigation}>
                    <ErrorBoundary fallback={() => <PageError />}>
                        {children}
                    </ErrorBoundary>
                </Main>
            </Content>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    minHeight: '100vh',

    '@supports (height: 100dvh)': {
        minHeight: '100dvh',
    },

    '@supports (min-height: -webkit-fill-available)': {
        minHeight: '-webkit-fill-available',
    },

    '@md': {
        height: '100vh',
        maxHeight: '100vh',
        flexDirection: 'column-reverse',

        '@supports (height: 100dvh)': {
            height: '100dvh',
            maxHeight: '100dvh',
        },

        '@supports (height: -webkit-fill-available)': {
            height: '-webkit-fill-available',
        },
    },

    '@standalone': {
        borderTop: `1px solid ${theme.colors.extraLightGrey}`,

        '@sm': {
            borderTop: 'none',
        },
    },
})

const Content = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: 0,
    gap: 16,
    overflow: 'auto',
    '--template-padding': '48px',

    '@md': {
        '--template-padding': '36px',
    },

    '@sm': {
        overflow: 'visible',
        background: theme.colors.white,
        '--template-padding': '24px',
        gap: 0,
    },

    '@xs': {
        '--template-padding': '16px',
    },

    // Allows print screen to split across multiple pages
    '@media print': {
        display: 'block',
        overflow: 'visible',
    },
})

const HeaderArea = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    padding: '0 var(--template-padding)',

    '@sm': {
        padding: '0 0',
    },
})

const HomeHeader = styled('div', {
    width: '100%',
    maxWidth: 600,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    padding: '8px var(--template-padding)',

    fediGradient: 'sky',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,

    '@sm': {
        width: '100%',
        padding: '0 16px',
        gap: theme.spacing.sm,
    },
})

const HeaderRow = styled('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
})

const CommunitySelectorWrapper = styled('div', {
    padding: '16px 0',
})

const Main = styled('main', {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `var(--template-padding)`,
    padding: '0 var(--template-padding) var(--template-padding)',

    '@sm': {
        padding: '0',
        minHeight: 0,
        background: theme.colors.white,
    },

    variants: {
        centered: {
            true: {
                paddingTop: 'var(--template-padding)',
                justifyContent: 'center',

                '@sm': {
                    padding: 0,
                },
            },
        },
    },
})
