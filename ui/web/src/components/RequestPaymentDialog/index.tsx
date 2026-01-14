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
import { TransactionListEntry } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useRouteState } from '../../context/RouteStateContext'
import { config, theme } from '../../styles'
import { getHashParams } from '../../utils/linking'
import { Dialog } from '.././Dialog'
import { DialogStatus } from '.././DialogStatus'
import { Switcher, type Option as SwitcherOption } from '../Switcher'
import LightningRequest from './LightningRequest'
import LnurlWithdraw from './LnurlWithdraw'
import OnchainRequest from './OnchainRequest'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
}

type Tab = 'lightning' | 'onchain'

export const RequestPaymentDialog: React.FC<Props> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const router = useRouter()
    const params = getHashParams(router.asPath)
    const lnurlw = useRouteState('/request')
    const federationId = params.id
    const [isCompleted, setIsCompleted] = useState(false)
    const [requestType, setRequestType] = useState<
        'lightning' | 'bitcoin' | 'lnurlw'
    >('lightning')

    const [showLnurlReceive, setShowLnurlReceive] = useState(false)
    const [receivedTransaction, setReceivedTransaction] =
        useState<TransactionListEntry | null>(null)
    const [activeTab, setActiveTab] = useState<Tab>('lightning')

    const containerRef = useRef<HTMLDivElement | null>(null)

    const isOnchainSupported = useIsOnchainDepositSupported(federationId)

    const { supportsLnurl } = useLnurlReceiveCode(federationId || '')

    useEffect(() => {
        setRequestType(activeTab === 'lightning' ? 'lightning' : 'bitcoin')
    }, [activeTab])

    const handleSubmit = () => {
        setIsCompleted(true)
    }

    const onTransactionReceived = (txn: TransactionListEntry) => {
        setReceivedTransaction(txn)
        setTimeout(() => onOpenChange(false), 3000)
    }

    const { address, makeOnchainAddress, onSaveNotes, reset } =
        useMakeOnchainAddress({
            federationId,
            onMempoolTransaction: onTransactionReceived,
        })

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()

    const switcherOptions: SwitcherOption<Tab>[] = [
        { label: t('words.lightning'), value: 'lightning' },
        { label: t('words.onchain'), value: 'onchain' },
    ]

    // Reset on close, focus input on desktop open
    useEffect(() => {
        if (!open) {
            setIsCompleted(false)
            setRequestType('lightning')
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
        if (open && lnurlw) setRequestType('lnurlw')
    }, [open, lnurlw])

    useEffect(() => {
        if (isOnchainSupported && requestType === 'bitcoin' && !address) {
            makeOnchainAddress()
        }
    }, [isOnchainSupported, requestType, makeOnchainAddress, address])

    return (
        <Dialog
            title={t('feature.receive.request-money')}
            open={open}
            onOpenChange={onOpenChange}>
            <Container ref={containerRef}>
                {isOnchainSupported && !isCompleted && !showLnurlReceive && (
                    <Switcher
                        options={switcherOptions}
                        selected={activeTab}
                        onChange={newTab => setActiveTab(newTab)}
                    />
                )}

                {requestType === 'lightning' ? (
                    <LightningRequest
                        onSubmit={handleSubmit}
                        onInvoicePaid={onTransactionReceived}
                        federationId={federationId}
                        {...(!!supportsLnurl && {
                            onLnurlClick: () => setShowLnurlReceive(true),
                        })}
                    />
                ) : requestType === 'lnurlw' ? (
                    <LnurlWithdraw
                        onSubmit={handleSubmit}
                        onWithdrawPaid={onTransactionReceived}
                        lnurlw={lnurlw}
                    />
                ) : (
                    <OnchainRequest
                        address={address}
                        onSaveNotes={onSaveNotes}
                    />
                )}

                {receivedTransaction && (
                    <DialogStatus
                        status="success"
                        title={`${t(
                            receivedTransaction.kind === 'onchainDeposit'
                                ? 'feature.receive.pending-transaction'
                                : 'feature.receive.you-received',
                        )}`}
                        description={`${amountUtils.formatSats(
                            amountUtils.msatToSat(receivedTransaction.amount),
                        )} ${t('words.sats')}`}
                    />
                )}
            </Container>
        </Dialog>
    )
}

const Container = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.md,
    minHeight: 0,
    height: '100%',
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
