import { dataToFrames } from 'qrloop'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import CopyIcon from '@fedi/common/assets/svgs/copy.svg'
import ShareIcon from '@fedi/common/assets/svgs/share.svg'
import { WEB_APP_URL } from '@fedi/common/constants/api'
import { useMinMaxSendAmount } from '@fedi/common/hooks/amount'
import { useSendEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { Federation, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useWarnBeforeUnload } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'
import { AmountInput } from './AmountInput'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { FederationWalletSelector } from './FederationWalletSelector'
import { Row } from './Flex'
import { QRCode } from './QRCode'
import { Text } from './Text'

interface Props {
    onEcashGenerated(): void
    onPaymentSent(): void
    federationId: Federation['id']
}

export const SendOffline: React.FC<Props> = ({
    onEcashGenerated,
    onPaymentSent,
    federationId,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { minimumAmount, maximumAmount } = useMinMaxSendAmount({
        fedimint,
        federationId,
    })
    const [amount, setAmount] = useState(0 as Sats)
    const [offlinePayment, setOfflinePayment] = useState<string | null>(null)
    const [qrFrames, setQrFrames] = useState<string[] | null>(null)
    const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [maxSendEcashAmount, setMaxSendEcashAmount] =
        useState<Sats>(maximumAmount)

    const { generateEcash, isGeneratingEcash } = useSendEcash(
        fedimint,
        federationId,
    )

    useWarnBeforeUnload(
        Boolean((!hasConfirmedPayment && offlinePayment) || isGeneratingEcash),
    )

    const handleChangeAmount = useCallback((amt: Sats) => {
        setSubmitAttempts(0)
        setAmount(amt)
    }, [])

    const handleSend = useCallback(async () => {
        if (!federationId) return
        setSubmitAttempts(attempt => attempt + 1)
        if (amount > maximumAmount || amount < minimumAmount) return

        try {
            const res = await generateEcash(amount)
            if (res) {
                onEcashGenerated()
                setOfflinePayment(res.ecash)
                setQrFrames(dataToFrames(Buffer.from(res.ecash, 'base64')))
            }
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [
        federationId,
        amount,
        minimumAmount,
        maximumAmount,
        toast,
        onEcashGenerated,
        t,
        generateEcash,
    ])

    const handleCopy = async () => {
        if (!navigator.clipboard) return

        try {
            const value = encodeURIComponent(offlinePayment as string)
            await navigator.clipboard.writeText(value)

            toast.show({
                status: 'success',
                content: t('phrases.copied-ecash-token'),
            })
        } catch (err) {
            // no-op
        }
    }

    const handleShare = async () => {
        if (!('share' in navigator)) {
            toast.show({
                status: 'error',
                content: t('feature.ecash.share-not-available'),
            })
            return
        }

        try {
            const value = encodeURIComponent(offlinePayment as string)

            await navigator.share({
                title: t('feature.ecash.share-ecash-deeplink'),
                text: `${WEB_APP_URL}/link#screen=ecash&id=${value}`,
            })
        } catch (err) {
            // no-op
        }
    }

    useEffect(() => {
        if (!federationId) return

        fedimint
            .calculateMaxGenerateEcash(federationId)
            .then(max => setMaxSendEcashAmount(amountUtils.msatToSat(max)))
            .catch(() => setMaxSendEcashAmount(maximumAmount))
    }, [amount, maximumAmount, federationId])

    if (offlinePayment && qrFrames) {
        return (
            <>
                <QRCode data={qrFrames} />
                <Row gap="md">
                    <Button
                        width="full"
                        variant="secondary"
                        icon={CopyIcon}
                        onClick={handleCopy}>
                        Copy
                    </Button>
                    <Button
                        width="full"
                        variant="secondary"
                        icon={ShareIcon}
                        onClick={handleShare}>
                        Share
                    </Button>
                </Row>
                <Checkbox
                    label={t('feature.send.i-have-sent-payment')}
                    checked={hasConfirmedPayment}
                    onChange={setHasConfirmedPayment}
                />
                <Button disabled={!hasConfirmedPayment} onClick={onPaymentSent}>
                    {t('words.done')}
                </Button>
            </>
        )
    } else {
        return (
            <>
                <AmountContainer>
                    <FederationWalletSelector />
                    <AmountInput
                        amount={amount}
                        federationId={federationId}
                        onChangeAmount={handleChangeAmount}
                        readOnly={isGeneratingEcash}
                        verb={t('words.send')}
                        minimumAmount={minimumAmount}
                        maximumAmount={
                            Math.min(maxSendEcashAmount, maximumAmount) as Sats
                        }
                        submitAttempts={submitAttempts}
                    />
                </AmountContainer>

                <HelpText>
                    <Text variant="small">
                        {t('feature.send.offline-send-warning')}
                    </Text>
                </HelpText>
                <Button loading={isGeneratingEcash} onClick={handleSend}>
                    {t('words.send')}
                </Button>
            </>
        )
    }
}

const AmountContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 0',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
})

const HelpText = styled('div', {
    maxWidth: 280,
    margin: 'auto',
    textAlign: 'center',
    color: theme.colors.grey,
})
