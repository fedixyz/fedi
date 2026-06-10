import { useRouter } from 'next/router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistoryList } from '@fedi/common/hooks/transactions'
import { makeLog } from '@fedi/common/utils/log'

import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'
import TransactionsList from '../components/TransactionList'
import { walletRoute } from '../constants/routes'
import { getHashParams } from '../utils/linking'

const log = makeLog('TransactionsPage')

const TransactionsPage: React.FC = () => {
    const { t } = useTranslation()
    const toast = useToast()
    const router = useRouter()
    const params = getHashParams(router.asPath)
    const { id: federationId, type } = params
    const isStabilityTransactions = type === 'stable'
    const handleFetchError = useCallback(
        (err: unknown) => {
            log.error('Error refreshing transactions', err)
            toast.error(t, err, 'errors.unknown-error')
        },
        [toast, t],
    )
    const { transactions, loading, isLoading, loadMoreTransactions } =
        useTransactionHistoryList({
            federationId,
            type: isStabilityTransactions ? 'stable' : 'transactions',
            onError: handleFetchError,
        })

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
                        transactions={transactions}
                        loading={loading}
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
