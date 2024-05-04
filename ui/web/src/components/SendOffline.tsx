import { dataToFrames } from 'qrloop'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMinMaxSendAmount } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederation } from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useAppSelector, useWarnBeforeUnload } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'
import { AmountInput } from './AmountInput'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { CopyInput } from './CopyInput'
import { QRCode } from './QRCode'
import { Text } from './Text'

interface Props {
    onEcashGenerated(): void
    onPaymentSent(): void
}

export const SendOffline: React.FC<Props> = ({
    onEcashGenerated,
    onPaymentSent,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const { minimumAmount, maximumAmount } = useMinMaxSendAmount()
    const [amount, setAmount] = useState(0 as Sats)
    const [isGeneratingEcash, setIsGeneratingEcash] = useState(false)
    const [offlinePayment, setOfflinePayment] = useState<string | null>(null)
    const [qrFrames, setQrFrames] = useState<string[] | null>(null)
    const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const federationId = activeFederation?.id

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

        setIsGeneratingEcash(true)
        try {
            const { ecash } = await fedimint.generateEcash(
                amountUtils.satToMsat(amount),
                federationId,
            )
            onEcashGenerated()
            setOfflinePayment(ecash)
            setQrFrames(dataToFrames(Buffer.from(ecash, 'base64')))
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
        setIsGeneratingEcash(false)
    }, [
        federationId,
        amount,
        minimumAmount,
        maximumAmount,
        toast,
        onEcashGenerated,
        t,
    ])

    if (offlinePayment && qrFrames) {
        return (
            <>
                <QRCode data={qrFrames} />
                <CopyInput
                    value={offlinePayment}
                    onCopyMessage={t('feature.send.copied-offline-payment')}
                />
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
                    <AmountInput
                        amount={amount}
                        onChangeAmount={handleChangeAmount}
                        readOnly={isGeneratingEcash}
                        verb={t('words.send')}
                        minimumAmount={minimumAmount}
                        maximumAmount={maximumAmount}
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
})

const HelpText = styled('div', {
    maxWidth: 280,
    margin: 'auto',
    textAlign: 'center',
    color: theme.colors.grey,
})
