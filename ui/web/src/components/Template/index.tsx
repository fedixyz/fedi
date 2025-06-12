import { useRouter } from 'next/router'
import React from 'react'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { selectMatrixStatus } from '@fedi/common/redux'
import { MatrixSyncStatus } from '@fedi/common/types'

import { useAppSelector, useMediaQuery } from '../../hooks'
import { config, styled, theme } from '../../styles'
import { shouldHideNavigation } from '../../utils/nav'
import { ChatOfflineIndicator } from '../Chat/ChatOfflineIndicator'
import { FederationSelector } from '../FederationSelector'
import { PageError } from '../PageError'
import { PopupFederationOver } from '../PopupFederationOver'
import { Navigation } from './Navigation'
import { PopupFederationCountdown } from './PopupFederationCountdown'

interface Props {
    children: React.ReactNode
}

export const Template: React.FC<Props> = ({ children }) => {
    const popupInfo = usePopupFederationInfo()
    const isPopupOver = !!popupInfo && popupInfo.secondsLeft <= 0
    const { asPath } = useRouter()
    const syncStatus = useAppSelector(selectMatrixStatus)

    const isSm = useMediaQuery(config.media.sm)
    const hideNavigation = shouldHideNavigation(asPath, isSm) || isPopupOver

    const shouldShowChatOffline =
        syncStatus === MatrixSyncStatus.syncing && asPath.startsWith('/chat')

    return (
        <Container className={hideNavigation ? 'hide-navigation' : ''}>
            {!hideNavigation && <Navigation />}
            <Content>
                <FederationHeader>
                    {asPath === '/home' && (
                        <FederationSelectorWrapper>
                            <FederationSelector joinable />
                        </FederationSelectorWrapper>
                    )}
                    <FederationControls>
                        <PopupFederationCountdown />
                    </FederationControls>
                    {shouldShowChatOffline && <ChatOfflineIndicator />}
                </FederationHeader>

                <Main centered={hideNavigation}>
                    <ErrorBoundary fallback={() => <PageError />}>
                        {isPopupOver ? <PopupFederationOver /> : children}
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
    overflow: 'auto',
    '--template-padding': '48px',

    '@md': {
        '--template-padding': '36px',
    },

    '@sm': {
        overflow: 'visible',
        background: theme.colors.white,
        '--template-padding': '24px',
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

const FederationHeader = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.lg,
    padding: 'var(--template-padding) 8px',

    '@sm': {
        padding: '0',
        gap: theme.space.sm,
    },
})

const FederationControls = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 4,
})

const FederationSelectorWrapper = styled('div', {
    padding: '16px 0',
})
