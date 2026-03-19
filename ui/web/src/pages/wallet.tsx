import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import {
    selectLastUsedFederation,
    selectNonFeaturedFederations,
} from '@fedi/common/redux'

import { Button } from '../components/Button'
import { ContentBlock } from '../components/ContentBlock'
import FeaturedFederation from '../components/FeaturedFederation'
import FederationTile from '../components/FederationTile'
import FederationsOverlay from '../components/FederationsOverlay'
import { Column } from '../components/Flex'
import * as Layout from '../components/Layout'
import { Text } from '../components/Text'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'

function WalletPage() {
    const { t } = useTranslation()
    const router = useRouter()

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()
    const [expandedWalletId, setExpandedWalletId] = useState<string | null>(
        null,
    )
    const [open, setOpen] = useState(false)

    const federations = useAppSelector(selectNonFeaturedFederations)
    const featuredFederation = useAppSelector(selectLastUsedFederation)

    // Get rates from cache
    // TODO: I don't think this is the right place to call this anymore...
    // We really just need to sync for a specific federation before a payment is made.
    useEffect(() => {
        syncCurrencyRatesAndCache()
    }, [syncCurrencyRatesAndCache])

    const content = useMemo(() => {
        if (federations.length === 0 && !featuredFederation) {
            return (
                <Empty grow center gap="md">
                    <EmptyContainer align="center" gap="md" fullWidth>
                        <Text weight="bold">
                            {t('feature.federations.no-federations')}
                        </Text>
                        <Text variant="caption">
                            {t('feature.wallet.join-federation')}
                        </Text>
                    </EmptyContainer>
                    <Button
                        onClick={() => router.push('/onboarding')}
                        width="full">
                        {t('phrases.join-a-federation')}
                    </Button>
                </Empty>
            )
        }

        return (
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
        )
    }, [federations, t, router, expandedWalletId, featuredFederation])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.PageHeader
                    title={t('words.wallet')}
                    onAddPress={() => router.push('/onboarding')}
                    onMenuPress={() => setOpen(true)}
                />
                <Layout.Content fullWidth>{content}</Layout.Content>
            </Layout.Root>
            <FederationsOverlay open={open} onOpenChange={setOpen} />
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

const Empty = styled(Column, {
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.lg,
})

const EmptyContainer = styled(Column, {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    border: `1px dashed ${theme.colors.lightGrey}`,
    borderRadius: 16,
})

export default WalletPage
