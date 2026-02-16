import { styled } from '@stitches/react'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import {
    useLnurlReceiveCode,
    useMakeOnchainAddress,
} from '@fedi/common/hooks/receive'
import { selectPaymentFederation } from '@fedi/common/redux'
import { TransactionListEntry } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { federationsRoute } from '../../constants/routes'
import { useRouteState } from '../../context/RouteStateContext'
import { useAppSelector } from '../../hooks'
import { config, theme } from '../../styles'
import { ContentBlock } from '../ContentBlock'
import { Column } from '../Flex'
import * as Layout from '../Layout'
import LightningRequest from '../Request/LightningRequest'
import LnurlReceive from '../Request/LnurlReceive'
import LnurlWithdraw from '../Request/LnurlWithdraw'
import OnchainRequest from '../Request/OnchainRequest'
import Success from '../Success'
import { Switcher, type Option as SwitcherOption } from '../Switcher'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
}

type Tab = 'lightning' | 'onchain' | 'lnurl'

const Request: React.FC<Props> = ({ open }) => {
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

    const containerRef = useRef<HTMLDivElement | null>(null)

    const isOnchainSupported = useIsOnchainDepositSupported(federationId)

    const { supportsLnurl } = useLnurlReceiveCode(federationId || '')

    const handleSubmit = () => {
        setIsCompleted(true)
    }

    const onTransactionReceived = (txn: TransactionListEntry) => {
        setReceivedTransaction(txn)
    }

    const { address, makeOnchainAddress, onSaveNotes, reset } =
        useMakeOnchainAddress({
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

    // Reset on close, focus input on desktop open
    useEffect(() => {
        if (!open) {
            setIsCompleted(false)
            setActiveTab('lightning')
            setReceivedTransaction(null)
            reset()
        } else {
            syncCurrencyRatesAndCache(federationId)
            if (!window.matchMedia(config.media.sm).matches) {
                requestAnimationFrame(() =>
                    containerRef.current?.querySelector('input')?.focus(),
                )
            }
        }
    }, [open, syncCurrencyRatesAndCache, reset, federationId])

    useEffect(() => {
        if (isOnchainSupported && activeTab === 'onchain' && !address) {
            makeOnchainAddress()
        }
    }, [isOnchainSupported, activeTab, makeOnchainAddress, address])

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
                onClick={() => router.push(federationsRoute)}
            />
        )
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>
                        {t('feature.receive.request-money')}
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
                                address={address}
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
