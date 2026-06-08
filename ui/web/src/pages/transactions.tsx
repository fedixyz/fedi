import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'

import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'
import TransactionsList from '../components/TransactionList'
import { walletRoute } from '../constants/routes'
import { getHashParams } from '../utils/linking'

const TransactionsPage: React.FC = () => {
    const { t } = useTranslation()
    const toast = useToast()
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(true)
    const params = getHashParams(router.asPath)
    const { id: federationId, type } = params

    const isStabilityTransactions = type === 'stable'

    const {
        fetchTransactions,
        fetchStabilityTransactions,
        stabilityPoolTxns,
        transactions,
    } = useTransactionHistory(federationId)

    const displayedTransactions = isStabilityTransactions
        ? stabilityPoolTxns
        : transactions

    const fetchDisplayedTransactions = isStabilityTransactions
        ? fetchStabilityTransactions
        : fetchTransactions

    useEffect(() => {
        setIsLoading(true)

        fetchDisplayedTransactions({ limit: 20, more: false })
            .catch(err => {
                toast.error(t, err, 'errors.unknown-error')
            })
            .finally(() => setIsLoading(false))
    }, [fetchDisplayedTransactions, toast, t])

    const loadMoreTransactions = useCallback(
        () =>
            fetchDisplayedTransactions({ limit: 20, more: true }).catch(err => {
                toast.error(t, err, 'errors.unknown-error')
            }),
        [fetchDisplayedTransactions, toast, t],
    )

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back={walletRoute}>
                    <Layout.Title subheader>
                        {t('words.transactions')}
                    </Layout.Title>
                </Layout.Header>

                <Layout.Content centered={isLoading} fullWidth>
                    <TransactionsList
                        transactions={displayedTransactions}
                        loading={
                            displayedTransactions.length === 0 && isLoading
                        }
                        federationId={federationId}
                        isStabilityPool={isStabilityTransactions}
                        loadMoreTransactions={loadMoreTransactions}
                    />
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

export default TransactionsPage
