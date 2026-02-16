import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import OfflineIcon from '@fedi/common/assets/svgs/offline.svg'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useIsOfflineWalletSupported } from '@fedi/common/hooks/federation'
import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import {
    selectShouldRateFederation,
    selectPaymentFederation,
    setSuggestedPaymentFederation,
} from '@fedi/common/redux'
import { ParserDataType, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { formatErrorMessage } from '@fedi/common/utils/format'

import { federationsRoute } from '../../constants/routes'
import {
    useRouteState,
    useRouteStateContext,
} from '../../context/RouteStateContext'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { AmountInput } from '../AmountInput'
import { Button } from '../Button'
import { ContentBlock } from '../ContentBlock'
import { FederationWalletSelector } from '../FederationWalletSelector'
import { Column } from '../Flex'
import * as Layout from '../Layout'
import { OmniInput, type OmniCustomAction } from '../OmniInput'
import RateFederationDialog from '../Onboarding/RateFederationDialog'
import PaymentType from '../PaymentType'
import Success from '../Success'
import { Text } from '../Text'
import { SendOffline } from './SendOffline'

const expectedInputTypes = [
    ParserDataType.Bolt11,
    ParserDataType.LnurlPay,
    ParserDataType.Bip21,
    ParserDataType.BitcoinAddress,
] as const

const Send: React.FC = () => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { pushWithState } = useRouteStateContext()
    const router = useRouter()

    const federation = useAppSelector(selectPaymentFederation)
    const federationId = federation?.id || ''

    const balance = federation?.balance
    const sendRouteState = useRouteState('/send')
    const {
        isReadyToPay,
        exactAmount,
        minimumAmount,
        maximumAmount,
        description,
        inputAmount,
        setInputAmount,
        handleOmniInput,
        handleOmniSend,
    } = useOmniPaymentState(federationId, t)
    const shouldRateFederation = useAppSelector(selectShouldRateFederation)

    const [showRateFederation, setShowRateFederation] = useState(false)
    const [isSendingOffline, setIsSendingOffline] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [hasSent, setHasSent] = useState(false)
    const [sendError, setSendError] = useState<string>()
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [paymentType, setPaymentType] = useState<'lightning' | 'onchain'>()

    const containerRef = useRef<HTMLDivElement | null>(null)

    const isOfflineWalletSupported = useIsOfflineWalletSupported(federationId)

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()

    useEffect(() => {
        // makes sure we auto-select a wallet to pay from if the user doesn't have one selected
        if (!federationId) {
            dispatch(setSuggestedPaymentFederation())
        }
    }, [dispatch, federationId])

    useEffect(() => {
        syncCurrencyRatesAndCache(federationId)
    }, [syncCurrencyRatesAndCache, federationId])

    // If we were sent here with route state, feed it to the omni input
    useEffect(() => {
        if (!sendRouteState) return

        setPaymentType(
            sendRouteState?.type === ParserDataType.Bolt11 ||
                sendRouteState?.type === ParserDataType.LnurlPay
                ? 'lightning'
                : 'onchain',
        )

        handleOmniInput(sendRouteState)
    }, [sendRouteState, handleOmniInput])

    const handleChangeAmount = useCallback(
        (amount: Sats) => {
            setSubmitAttempts(0)
            setInputAmount(amount)
        },
        [setInputAmount],
    )

    const handleSend = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (inputAmount > maximumAmount || inputAmount < minimumAmount) return
        setIsSending(true)
        try {
            await handleOmniSend(inputAmount)
            setHasSent(true)
            setTimeout(() => {
                // onOpenChange(false)

                if (shouldRateFederation) setShowRateFederation(true)
            }, 2500)
        } catch (err) {
            setSendError(formatErrorMessage(t, err, 'errors.unknown-error'))
        }
        setIsSending(false)
    }

    if (typeof balance !== 'number') return null

    let content: React.ReactNode

    const satsFmt = inputAmount ? amountUtils.formatSats(inputAmount) : ''

    if (isReadyToPay) {
        content = (
            <>
                <InvoiceContainer>
                    <FederationWalletSelector />
                    <AmountInput
                        amount={inputAmount}
                        onChangeAmount={handleChangeAmount}
                        readOnly={!!exactAmount}
                        verb={t('words.send')}
                        minimumAmount={minimumAmount}
                        maximumAmount={maximumAmount}
                        submitAttempts={submitAttempts}
                        extraInput={
                            description ? (
                                <InvoiceDescription>
                                    <Text variant="caption" weight="medium">
                                        &quot;{description}&quot;
                                    </Text>
                                </InvoiceDescription>
                            ) : undefined
                        }
                        content={
                            <PaymentType
                                type={
                                    paymentType === 'lightning'
                                        ? 'lightning'
                                        : 'onchain'
                                }
                            />
                        }
                    />
                </InvoiceContainer>
                <Button
                    onClick={handleSend}
                    loading={isSending}
                    disabled={isSending}>
                    {t('words.send')}
                </Button>
            </>
        )

        if (hasSent) {
            return (
                <Success
                    title={t('feature.send.you-sent-amount-unit', {
                        amount: satsFmt,
                        unit: t('words.sats'),
                    })}
                    buttonText={t('words.done')}
                    onClick={() => router.push(federationsRoute)}
                />
            )
        }
        if (sendError) {
            return (
                // Success can show errors too but needs a better name
                <Success
                    title={t('errors.failed-to-send-payment')}
                    buttonText={t('words.done')}
                    onClick={() => router.push(federationsRoute)}
                    type="error"
                />
            )
        }
    } else if (isSendingOffline) {
        content = (
            <SendOffline
                onEcashGenerated={() => {}}
                onPaymentSent={() => {
                    if (shouldRateFederation) setShowRateFederation(true)
                    router.push(federationsRoute)
                }}
                federationId={federationId}
            />
        )
    } else {
        const customActions: OmniCustomAction[] = ['paste']

        if (isOfflineWalletSupported) {
            customActions.push({
                label: t('feature.send.send-offline'),
                icon: OfflineIcon,
                onClick: () => setIsSendingOffline(true),
            })
        }

        content = (
            <OmniInput
                expectedInputTypes={expectedInputTypes}
                onExpectedInput={parsedData =>
                    pushWithState('/send', parsedData)
                }
                onUnexpectedSuccess={() => {}}
                customActions={customActions}
            />
        )
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header back>
                    <Layout.Title subheader>
                        {t('feature.send.send-bitcoin')}
                    </Layout.Title>
                </Layout.Header>
                <Layout.Content>
                    <Column gap="lg" grow ref={containerRef}>
                        {content}
                    </Column>
                </Layout.Content>

                {shouldRateFederation && (
                    <RateFederationDialog
                        show={showRateFederation}
                        onDismiss={() => {
                            setShowRateFederation(false)
                        }}
                    />
                )}
            </Layout.Root>
        </ContentBlock>
    )
}

const InvoiceContainer = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingBottom: theme.spacing.lg,
    width: '100%',
})

const InvoiceDescription = styled('div', {
    textAlign: 'center',
    marginBottom: 24,
})

export default Send
