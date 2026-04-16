import { dataToFrames } from 'qrloop'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import CancelIcon from '@fedi/common/assets/svgs/close.svg'
import CopyIcon from '@fedi/common/assets/svgs/copy.svg'
import ShareIcon from '@fedi/common/assets/svgs/share.svg'
import { WEB_APP_URL } from '@fedi/common/constants/api'
import {
    useAmountFormatter,
    useMinMaxSendAmount,
} from '@fedi/common/hooks/amount'
import { useSendEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { Federation, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { styled, theme } from '../../styles'
import { AmountInput } from '../AmountInput'
import { Button } from '../Button'
import WalletSwitcher from '../Federation/WalletSwitcher'
import { Column, Row } from '../Flex'
import PaymentType from '../PaymentType'
import { QRCode } from '../QRCode'
import { Text } from '../Text'

interface Props {
    onEcashGenerated(): void
    onPaymentSent(amount: Sats): void
    onCancel(ecash: string): void
    federationId: Federation['id']
}

export const SendOffline: React.FC<Props> = ({
    onEcashGenerated,
    onPaymentSent,
    onCancel,
    federationId,
}) => {
    const { t } = useTranslation()
    const toast = useToast()

    const { minimumAmount, maximumAmount } = useMinMaxSendAmount({
        ecashRequest: {},
        federationId,
    })
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })

    const [amount, setAmount] = useState(0 as Sats)
    const [ecash, setEcash] = useState<string | null>(null)
    const [qrFrames, setQrFrames] = useState<string[] | null>(null)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const { generateEcash, isGeneratingEcash } = useSendEcash(federationId)

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(amountUtils.satToMsat(amount))

    const handleChangeAmount = useCallback((amt: Sats) => {
        setSubmitAttempts(0)
        setAmount(amt)
    }, [])

    const handleNext = async () => {
        if (!federationId) return
        setSubmitAttempts(attempt => attempt + 1)
        if (amount > maximumAmount || amount < minimumAmount) return

        try {
            const res = await generateEcash(amount)

            if (res) {
                onEcashGenerated()
                setEcash(res.ecash)
                setQrFrames(dataToFrames(Buffer.from(res.ecash, 'base64')))
            }
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }

    const handleCopy = async () => {
        if (!navigator.clipboard || !ecash) return

        try {
            await navigator.clipboard.writeText(ecash)

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
            if (!ecash) return
            const value = encodeURIComponent(ecash)

            await navigator.share({
                title: t('feature.ecash.share-ecash-deeplink'),
                text: `${WEB_APP_URL}/link#screen=ecash&id=${value}`,
            })
        } catch (err) {
            // no-op
        }
    }

    if (ecash && qrFrames) {
        return (
            <Column grow>
                <Column
                    gap="md"
                    grow
                    css={{ padding: `0 ${theme.spacing.lg}` }}>
                    <Column align="center">
                        <Text variant="h1" css={{ fontWeight: 500 }}>
                            {formattedPrimaryAmount}
                        </Text>
                        <Text>{formattedSecondaryAmount}</Text>
                    </Column>
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
                    <HoloWrapper>
                        <HoloContent>
                            <Text
                                variant="small"
                                css={{ color: theme.colors.darkGrey }}>
                                {t('feature.send.ecash-recipient-notice')}
                            </Text>
                        </HoloContent>
                    </HoloWrapper>
                </Column>
                <Column gap="md">
                    <Button
                        onClick={() => onCancel(ecash)}
                        variant="tertiary"
                        icon={CancelIcon}
                        css={{ color: theme.colors.red }}>
                        {t('feature.send.cancel-send')}
                    </Button>
                    <Button onClick={() => onPaymentSent(amount)}>
                        {t('feature.send.i-have-sent-payment')}
                    </Button>
                </Column>
            </Column>
        )
    } else {
        return (
            <>
                <AmountContainer>
                    <WalletSwitcher />
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

                <Button
                    loading={isGeneratingEcash}
                    onClick={handleNext}
                    css={{ flexShrink: 0 }}>
                    {t('words.next')}
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
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    width: '100%',
})

const HoloWrapper = styled('div', {
    borderRadius: 8,
    fediGradient: 'sky-heavy',
    padding: 2,
})

const HoloContent = styled('div', {
    background: theme.colors.white,
    borderRadius: 8,
    padding: theme.spacing.sm,
})
