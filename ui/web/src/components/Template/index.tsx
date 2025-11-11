import { useRouter } from 'next/router'
import React from 'react'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { selectMatrixStatus } from '@fedi/common/redux'
import { MatrixSyncStatus } from '@fedi/common/types'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { shouldHideNavigation } from '../../utils/nav'
import { ChatOfflineIndicator } from '../Chat/ChatOfflineIndicator'
import { PageError } from '../PageError'
import { Navigation } from './Navigation'

interface Props {
    children: React.ReactNode
}

export const Template: React.FC<Props> = ({ children }) => {
    const router = useRouter()
    const { asPath } = router
    const syncStatus = useAppSelector(selectMatrixStatus)

    const hideNavigation = shouldHideNavigation(asPath)

    const shouldShowChatOffline =
        syncStatus === MatrixSyncStatus.syncing && asPath.startsWith('/chat')

    return (
        <Container>
            <Content>
                {shouldShowChatOffline && <ChatOfflineIndicator />}

                <ErrorBoundary fallback={() => <PageError />}>
                    {children}
                </ErrorBoundary>

                {!hideNavigation && <Navigation />}
            </Content>
        </Container>
    )
}

const Container = styled('div', {
    overflow: 'hidden',
    width: '100%',
})

const Content = styled('div', {
    background: theme.colors.white,
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    margin: '0 auto',
    minHeight: 0,
    maxWidth: 480,
})
