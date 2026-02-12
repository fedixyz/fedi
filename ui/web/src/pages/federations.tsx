import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import {
    selectLastUsedFederation,
    selectNonFeaturedFederations,
} from '@fedi/common/redux'

import { ContentBlock } from '../components/ContentBlock'
import FeaturedFederation from '../components/FeaturedFederation'
import FederationTile from '../components/FederationTile'
import * as Layout from '../components/Layout'
import { RequestPaymentDialog } from '../components/RequestPaymentDialog'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'

function FederationsPage() {
    const { t } = useTranslation()
    const router = useRouter()

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()
    const [expandedWalletId, setExpandedWalletId] = useState<string | null>(
        null,
    )

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
                <Layout.PageHeader
                    title={t('words.wallets')}
                    onAddPress={() => router.push('/onboarding')}
                />
                <Layout.Content fullWidth>
                    <FederationsListWrapper>
                        <FeaturedFederation />
                        {federations.map(federation => (
                            <FederationTile
                                key={federation.id}
                                federation={federation}
                                expanded={expandedWalletId === federation.id}
                                setExpandedWalletId={setExpandedWalletId}
                            />
                        ))}
                    </FederationsListWrapper>
                </Layout.Content>
            </Layout.Root>

            {router.pathname === '/request' && (
                <RequestPaymentDialog
                    open={true}
                    onOpenChange={() => router.push('/federations')}
                />
            )}
        </ContentBlock>
    )
}

const FederationsListWrapper = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
    padding: 20,

    '@sm': {
        paddingLeft: theme.spacing.lg,
        paddingRight: theme.spacing.lg,
    },
})

export default FederationsPage
