import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'

import { BackHeader } from '../components/BackHeader'
import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'
import TransactionsList from '../components/TransactionList'
import { fedimint } from '../lib/bridge'

const TransactionsPage: React.FC = () => {
    const { t } = useTranslation()
    const toast = useToast()
    const [isLoading, setIsLoading] = useState(true)
    const { transactions, fetchTransactions } = useTransactionHistory(fedimint)

    useEffect(() => {
        fetchTransactions({ more: false })
            .catch(err => {
                toast.error(t, err, 'errors.unknown-error')
            })
            .finally(() => setIsLoading(false))
    }, [fetchTransactions, toast, t])

    return (
        <ContentBlock>
            <Layout.Root>
                <BackHeader title={t('words.transactions')} subheader />

                <Layout.Content centered={isLoading} fullWidth>
                    <TransactionsList
                        transactions={transactions}
                        loading={transactions.length === 0 && isLoading}
                    />
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

export default TransactionsPage
