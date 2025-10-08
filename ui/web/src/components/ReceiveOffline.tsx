import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUpdatingRef } from '@fedi/common/hooks/util'
import { Federation, MSats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import {
    decodeCashuTokens,
    executeMelts,
    getMeltQuotes,
} from '@fedi/common/utils/cashu'
import { formatErrorMessage } from '@fedi/common/utils/format'

import { fedimint } from '../lib/bridge'
import { DialogStatus, DialogStatusProps } from './DialogStatus'
import { Input } from './Input'
import { QRScanner, ScanResult } from './QRScanner'

interface Props {
    onReceive(amount: MSats): void
    federationId: Federation['id']
}

export const ReceiveOffline: React.FC<Props> = ({
    onReceive,
    federationId,
}) => {
    const { t } = useTranslation()
    const [value, setValue] = useState('')
    const [isRedeeming, setIsRedeeming] = useState(false)
    const [redeemError, setRedeemError] = useState<string | null>(null)
    const [redeemAmount, setRedeemAmount] = useState<MSats | null>(null)
    const onReceiveRef = useUpdatingRef(onReceive)

    const handleRedeem = useCallback(
        async (ecash: string) => {
            setIsRedeeming(true)
            try {
                if (!federationId) throw new Error('No federation ID provided')
                let msats: MSats
                if (ecash.startsWith('cashu')) {
                    const tokens = await decodeCashuTokens(ecash)
                    const meltSummary = await getMeltQuotes(
                        tokens,
                        fedimint,
                        federationId,
                    )
                    const meltResult = await executeMelts(meltSummary)
                    msats = meltResult.mSats
                } else {
                    const result = await fedimint.receiveEcash(
                        ecash,
                        federationId,
                    )
                    msats = result[0]
                }
                setRedeemAmount(msats)
                // Delay reporting until the message has shown for a bit
                setTimeout(() => onReceiveRef.current(msats), 3000)
            } catch (err) {
                setRedeemError(
                    formatErrorMessage(t, err, 'errors.unknown-error'),
                )
            }
            setIsRedeeming(false)
        },
        [federationId, t, onReceiveRef],
    )

    // Set the input value on scan
    const handleScan = useCallback(
        (result: ScanResult) => {
            if (isRedeeming) return
            setValue(result.data)
        },
        [isRedeeming],
    )

    // Attempt to redeem when input is pasted in
    useEffect(() => {
        if (value) {
            handleRedeem(value)
        }
    }, [handleRedeem, value])

    let dialogStatusProps: DialogStatusProps | undefined
    if (isRedeeming) {
        dialogStatusProps = {
            status: 'loading',
            title: t('words.pending'),
        }
    } else if (redeemError) {
        dialogStatusProps = {
            status: 'error',
            title: t('words.rejected'),
            description: redeemError,
        }
    } else if (redeemAmount !== null) {
        dialogStatusProps = {
            status: 'success',
            title: t('feature.receive.you-received-amount-unit', {
                amount: amountUtils.formatSats(
                    amountUtils.msatToSat(redeemAmount),
                ),
                unit: t('words.sats'),
            }),
        }
    }

    return (
        <>
            <QRScanner onScan={handleScan} />
            <Input
                placeholder="Paste offline send code"
                value={value}
                onChange={ev => setValue(ev.currentTarget.value)}
                disabled={isRedeeming}
            />
            {dialogStatusProps && <DialogStatus {...dialogStatusProps} />}
        </>
    )
}
