import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import {
    selectLastUsedFederation,
    selectNonFeaturedFederations,
} from '@fedi/common/redux'

import { ContentBlock } from '../components/ContentBlock'
import FeaturedFederation from '../components/FeaturedFederation'
import FederationTile from '../components/FederationTile'
import { Column } from '../components/Flex'
import * as Layout from '../components/Layout'
import MainHeaderButtons from '../components/MainHeaderButtons'
import { RequestPaymentDialog } from '../components/RequestPaymentDialog'
import { RequireBackupModal } from '../components/RequireBackupModal'
import { SendPaymentDialog } from '../components/SendPaymentDialog'
import { useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'

function FederationsPage() {
    const { t } = useTranslation()
    const router = useRouter()

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache(fedimint)

    // Get federation data
    const federations = useAppSelector(selectNonFeaturedFederations)
    const featuredFederation = useAppSelector(selectLastUsedFederation)

    // Get rates from cache
    // TODO: I don't think this is the right place to call this anymore...
    // We really just need to sync for a specific federation before a payment is made.
    useEffect(() => {
        syncCurrencyRatesAndCache()
    }, [syncCurrencyRatesAndCache])

    // Redirect if no federations
    if (!featuredFederation && federations.length === 0) {
        router.push('/onboarding')
        return null
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header>
                    <Layout.Title>{t('words.wallets')}</Layout.Title>
                    <MainHeaderButtons
                        onAddPress={() => router.push('/onboarding')}
                    />
                </Layout.Header>
                <Layout.Content fullWidth>
                    <Column gap="lg">
                        <FeaturedFederation />

                        <FederationsListWrapper>
                            {federations.map(federation => (
                                <FederationTile
                                    key={federation.id}
                                    federation={federation}
                                />
                            ))}
                        </FederationsListWrapper>
                    </Column>
                </Layout.Content>
            </Layout.Root>

            {/* Modal - Ask user to backup if their balance is above 1000 sats */}
            <RequireBackupModal />

            <RequestPaymentDialog
                open={router.pathname === '/request'}
                onOpenChange={() => router.push('/federations')}
            />
            <SendPaymentDialog
                open={router.pathname === '/send'}
                onOpenChange={() => router.push('/federations')}
            />
        </ContentBlock>
    )
}

const FederationsListWrapper = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.lg,
})

export default FederationsPage
