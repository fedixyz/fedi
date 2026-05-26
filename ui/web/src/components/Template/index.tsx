import { useRouter } from 'next/router'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import {
    closeBrowser,
    selectCurrentUrl,
    selectIsInternetUnreachable,
    selectMatrixStatus,
} from '@fedi/common/redux'
import { MatrixSyncStatus } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { shouldHideNavigation } from '../../utils/nav'
import { FediBrowser } from '../FediBrowser'
import { OfflineIndicator } from '../OfflineIndicator'
import { PageError } from '../PageError'
import { Navigation } from './Navigation'

interface Props {
    children: React.ReactNode
}

export const Template: React.FC<Props> = ({ children }) => {
    const { t } = useTranslation()
    const router = useRouter()
    const dispatch = useAppDispatch()
    const { asPath } = router
    const syncStatus = useAppSelector(selectMatrixStatus)

    const currentUrl = useAppSelector(selectCurrentUrl)
    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()

    const isOffline = useAppSelector(selectIsInternetUnreachable)

    const hideNavigation = shouldHideNavigation(asPath)
    const shouldShowChatOffline =
        syncStatus === MatrixSyncStatus.syncing && asPath.startsWith('/chat')
    const offlineLabel = isOffline
        ? `${t('errors.internet-offline')}...`
        : shouldShowChatOffline
          ? `${t('feature.chat.waiting-for-network')}...`
          : undefined

    // Sync currency rates once on mount to ensure
    // rates are available regardless of how the user enters the app
    useEffect(() => {
        syncCurrencyRatesAndCache()
    }, [syncCurrencyRatesAndCache])

    return (
        <AppContainer>
            <AppContent>
                {offlineLabel && <OfflineIndicator label={offlineLabel} />}

                <ErrorBoundary fallback={() => <PageError />}>
                    {children}
                </ErrorBoundary>

                {!hideNavigation && <Navigation />}
            </AppContent>

            {!!currentUrl && (
                <FediBrowser
                    url={currentUrl}
                    onClose={() => dispatch(closeBrowser())}
                />
            )}
        </AppContainer>
    )
}

export const AppContainer = styled('div', {
    overflow: 'hidden',
    width: '100%',
})

export const AppContent = styled('div', {
    background: theme.colors.white,
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    margin: '0 auto',
    minHeight: 0,
    maxWidth: 480,
})
