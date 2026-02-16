import { dataToFrames } from 'qrloop'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import CopyIcon from '@fedi/common/assets/svgs/copy.svg'
import ShareIcon from '@fedi/common/assets/svgs/share.svg'
import { WEB_APP_URL } from '@fedi/common/constants/api'
import { useMinMaxSendAmount } from '@fedi/common/hooks/amount'
import { useSendEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { Federation, Sats } from '@fedi/common/types'

import { useWarnBeforeUnload } from '../../hooks'
import { styled, theme } from '../../styles'
import { AmountInput } from '../AmountInput'
import { Button } from '../Button'
import { Checkbox } from '../Checkbox'
import { FederationWalletSelector } from '../FederationWalletSelector'
import { Row } from '../Flex'
import PaymentType from '../PaymentType'
import { QRCode } from '../QRCode'
import { Text } from '../Text'

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
        ecashRequest: {},
        federationId,
    })
    const [amount, setAmount] = useState(0 as Sats)
    const [offlinePayment, setOfflinePayment] = useState<string | null>(null)
    const [qrFrames, setQrFrames] = useState<string[] | null>(null)
    const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const { generateEcash, isGeneratingEcash } = useSendEcash(federationId)

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
        if (!navigator.clipboard || !offlinePayment) return

        try {
            await navigator.clipboard.writeText(offlinePayment)

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
                        maximumAmount={maximumAmount}
                        submitAttempts={submitAttempts}
                        content={<PaymentType type="ecash" />}
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
    alignItems: 'center',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingBottom: theme.spacing.lg,
    width: '100%',
})

const HelpText = styled('div', {
    maxWidth: 280,
    margin: 'auto',
    textAlign: 'center',
    color: theme.colors.grey,
})
