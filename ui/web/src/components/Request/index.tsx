import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import {
    useLnurlReceiveCode,
    useMakeOnchainAddress,
} from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { selectPaymentFederation } from '@fedi/common/redux'
import { TransactionListEntry } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { walletRoute } from '../../constants/routes'
import { useRouteState } from '../../context/RouteStateContext'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { ContentBlock } from '../ContentBlock'
import WalletSwitcher from '../Federation/WalletSwitcher'
import { Column } from '../Flex'
import * as Layout from '../Layout'
import LightningRequest from '../Request/LightningRequest'
import LnurlReceive from '../Request/LnurlReceive'
import LnurlWithdraw from '../Request/LnurlWithdraw'
import OnchainRequest from '../Request/OnchainRequest'
import Success from '../Success'
import { Switcher, type Option as SwitcherOption } from '../Switcher'

type Tab = 'lightning' | 'onchain' | 'lnurl'

const Request: React.FC = () => {
    const { t } = useTranslation()
    const router = useRouter()
    const lnurlw = useRouteState('/request')
    const federation = useAppSelector(selectPaymentFederation)
    const federationId = federation?.id || ''

    const [isCompleted, setIsCompleted] = useState(false)
    const [showLnurlReceive, setShowLnurlReceive] = useState(false)
    const [receivedTransaction, setReceivedTransaction] =
        useState<TransactionListEntry | null>(null)
    const [activeTab, setActiveTab] = useState<Tab>('lightning')
    const [generatedOnchainAddress, setGeneratedOnchainAddress] = useState<{
        federationId: string
        address: string
    } | null>(null)

    const containerRef = useRef<HTMLDivElement | null>(null)

    const isOnchainSupported = useIsOnchainDepositSupported(federationId)
    const toast = useToast()

    const { supportsLnurl } = useLnurlReceiveCode(federationId || '')

    const handleSubmit = () => {
        setIsCompleted(true)
    }

    const onTransactionReceived = (txn: TransactionListEntry) => {
        setReceivedTransaction(txn)
    }

    const { makeOnchainAddress, onSaveNotes } = useMakeOnchainAddress({
        federationId,
        onMempoolTransaction: onTransactionReceived,
    })

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()

    const switcherOptions: SwitcherOption<Tab>[] = [
        { label: t('words.lightning'), value: 'lightning' },
    ]

    if (supportsLnurl)
        switcherOptions.push({ label: t('words.lnurl'), value: 'lnurl' })
    if (isOnchainSupported)
        switcherOptions.push({ label: t('words.onchain'), value: 'onchain' })

    // Sync currency rates on focus
    useEffect(() => {
        const onFocus = () => syncCurrencyRatesAndCache()

        window.addEventListener('focus', onFocus)

        return () => window.removeEventListener('focus', onFocus)
    }, [syncCurrencyRatesAndCache])

    useEffect(() => {
        if (!federationId) return
        if (generatedOnchainAddress?.federationId === federationId) return

        makeOnchainAddress()
            .then(address => {
                if (!federationId || !address) {
                    setGeneratedOnchainAddress(null)
                    return
                }

                setGeneratedOnchainAddress({
                    federationId,
                    address,
                })
            })
            .catch(e => toast.error(t, e))
    }, [makeOnchainAddress, federationId, generatedOnchainAddress, toast, t])

    useEffect(() => {
        if (
            (activeTab === 'lnurl' && supportsLnurl === false) ||
            (activeTab === 'onchain' && isOnchainSupported === false)
        ) {
            setActiveTab('lightning')
        }
    }, [activeTab, isOnchainSupported, supportsLnurl])

    if (receivedTransaction) {
        return (
            <Success
                title={`${t(
                    receivedTransaction.kind === 'onchainDeposit'
                        ? 'feature.receive.pending-transaction'
                        : 'feature.receive.you-received',
                )}`}
                description={`${amountUtils.formatSats(amountUtils.msatToSat(receivedTransaction.amount))} ${t('words.sats')}`}
                buttonText={t('words.done')}
                onClick={() => router.push(walletRoute)}
            />
        )
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>
                        {t('feature.receive.receive-bitcoin')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content fullWidth>
                    <Content gap="lg" grow ref={containerRef}>
                        {isOnchainSupported &&
                            !isCompleted &&
                            !showLnurlReceive && (
                                <Switcher
                                    options={switcherOptions}
                                    selected={activeTab}
                                    onChange={newTab => setActiveTab(newTab)}
                                />
                            )}
                        <WalletSwitcher />
                        {lnurlw ? (
                            <LnurlWithdraw
                                onSubmit={handleSubmit}
                                lnurlw={lnurlw}
                                onWithdrawPaid={onTransactionReceived}
                            />
                        ) : activeTab === 'lightning' ? (
                            <LightningRequest
                                onSubmit={handleSubmit}
                                onInvoicePaid={onTransactionReceived}
                                federationId={federationId}
                                {...(!!supportsLnurl && {
                                    onLnurlClick: () =>
                                        setShowLnurlReceive(true),
                                })}
                            />
                        ) : activeTab === 'lnurl' ? (
                            <LnurlReceive
                                onSubmit={handleSubmit}
                                onWithdrawPaid={onTransactionReceived}
                                federationId={federationId}
                            />
                        ) : (
                            <OnchainRequest
                                address={generatedOnchainAddress?.address ?? ''}
                                onSaveNotes={onSaveNotes}
                            />
                        )}
                    </Content>
                </Layout.Content>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled(Column, {
    padding: theme.spacing.xl,
    paddingTop: 0,
})

export const NoteInput = styled('input', {
    width: '100%',
    padding: 8,
    textAlign: 'center',
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
    background: 'none',
    border: 'none',
    outline: 'none',

    '&[readonly]': {
        cursor: 'default',
    },
})

export const QRContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 16,
})

export default Request
