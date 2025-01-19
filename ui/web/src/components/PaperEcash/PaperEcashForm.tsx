import { dataToFrames } from 'qrloop'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectBtcExchangeRate,
    selectCurrency,
    selectFederationBalance,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { Button } from '../../components/Button'
import { Checkbox } from '../../components/Checkbox'
import { Input } from '../../components/Input'
import { Text } from '../../components/Text'
import { useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { EcashPaper } from '../../pages/internal/paper-ecash'
import { styled, theme } from '../../styles'

const log = makeLog('PaperEcashForm')

interface Props {
    onChangeEcashPapers(ecashPapers: EcashPaper[]): void
}

export const PaperEcashForm: React.FC<Props> = ({ onChangeEcashPapers }) => {
    const { t } = useTranslation()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const balance = useAppSelector(selectFederationBalance)
    const currency = useAppSelector(selectCurrency)
    const exchangeRate = useAppSelector(selectBtcExchangeRate)
    const [countValue, setCountValue] = useState('1')
    const [msatsValue, setMsatsValue] = useState('10000')
    const [isOptimizedQr, setIsOptimizedQr] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)

    // Given the current msats value, calculate the powers of 2 required to
    // add up to it. Use this to inform the user and provide smaller suggestions.
    const msatsDenominations = useMemo(() => {
        const msats = parseInt(msatsValue, 10) as MSats
        const msatsBinary = (msats >>> 0).toString(2)
        const denoms: number[] = []

        msatsBinary.split('').forEach((bit, index) => {
            if (bit === '1') {
                denoms.push(2 ** (msatsBinary.length - index - 1))
            }
        })
        return denoms
    }, [msatsValue])

    const msatsSuggestions = useMemo(() => {
        const suggestions: { amount: MSats; size: number }[] = []
        for (let i = 1; i < Math.min(msatsDenominations.length, 6); i++) {
            const amount = msatsDenominations
                .slice(0, i)
                .reduce((prev, denom) => prev + denom, 0) as MSats
            suggestions.push({
                amount,
                size: i,
            })
        }
        return suggestions.reverse()
    }, [msatsDenominations])

    const handleGenerate = async () => {
        setIsGenerating(true)
        const ecashPapers: EcashPaper[] = []
        try {
            if (!activeFederation) throw new Error('No active federation')
            const count = parseInt(countValue, 10)
            const amount = parseInt(msatsValue) as MSats
            for (let i = 0; i < count; i++) {
                const { ecash } = await fedimint.generateEcash(
                    amount,
                    activeFederation.id,
                )
                const frames = dataToFrames(
                    isOptimizedQr ? Buffer.from(ecash, 'base64') : ecash,
                )
                ecashPapers.push({ ecash, frames, amount })
            }
        } catch (err) {
            log.error('Failed to generate', err)
            toast.error(t, err, 'Failed to generate, check logs')
        }
        onChangeEcashPapers(ecashPapers)
        setIsGenerating(false)
    }

    const msatsInt = (parseInt(msatsValue, 10) || 0) as MSats
    const satsFormatted = amountUtils.formatSats(
        amountUtils.msatToSat(msatsInt),
    )
    const fiatFormatted = amountUtils.formatFiat(
        amountUtils.msatToFiat(msatsInt, exchangeRate),
        currency,
    )
    const countInt = parseInt(countValue, 10) || 0
    const msatTotalCost = (msatsInt * countInt) as MSats
    const hasEnoughBalance = msatTotalCost <= balance

    const isFormValid =
        hasEnoughBalance &&
        !Number.isNaN(countInt) &&
        countInt > 0 &&
        !Number.isNaN(msatsInt) &&
        msatsInt > 0
    const isInputDisabled = isGenerating

    const handleSubmit = (ev: React.FormEvent) => {
        ev.preventDefault()
        if (isFormValid) handleGenerate()
    }

    return (
        <Form onSubmit={handleSubmit}>
            <Text variant="caption">
                Balance:{' '}
                {amountUtils.formatSats(amountUtils.msatToSat(balance))} SATS
            </Text>
            <Input
                label="Number of ecash papers"
                type="number"
                value={countValue}
                min={1}
                step={1}
                onChange={ev => setCountValue(ev.currentTarget.value)}
                disabled={isInputDisabled}
            />
            <Input
                label="Millisats (1/1000th of a SAT) per ecash paper"
                type="number"
                value={msatsValue}
                min={1}
                step={1}
                onChange={ev => setMsatsValue(ev.currentTarget.value)}
                disabled={isInputDisabled}
            />
            <Text variant="small" css={{ lineHeight: 1.8 }}>
                {msatsInt} millisats ({satsFormatted} SATS / {fiatFormatted})
                requires at least {msatsDenominations.length} ecash tokens
                {msatsDenominations.length > 1 && (
                    <>
                        <br />
                        {msatsDenominations.join(' + ')}
                    </>
                )}
            </Text>
            {Boolean(msatsSuggestions.length) && (
                <SuggestionsList>
                    {msatsSuggestions.map(({ amount, size }) => (
                        <li key={size}>
                            <SuggestionButton
                                type="button"
                                onClick={() =>
                                    setMsatsValue(amount.toString())
                                }>
                                Reduce to {amount} msats (
                                {amountUtils.formatFiat(
                                    amountUtils.msatToFiat(
                                        amount,
                                        exchangeRate,
                                    ),
                                    currency,
                                )}
                                ) to use {size} tokens
                            </SuggestionButton>
                        </li>
                    ))}
                </SuggestionsList>
            )}
            <Text
                variant="small"
                css={{
                    color: hasEnoughBalance ? undefined : theme.colors.red,
                }}>
                Generating {countInt} papers * {satsFormatted} SATS per paper
                each ={' '}
                {amountUtils.formatSats(amountUtils.msatToSat(msatTotalCost))}{' '}
                SATS total
            </Text>
            <Checkbox
                checked={isOptimizedQr}
                onChange={setIsOptimizedQr}
                label="Use optimized QR codes? (Scannable by app v1.13.30+)"
                labelTextProps={{ variant: 'small' }}
                disabled={isInputDisabled}
            />
            <Button
                type="submit"
                width="full"
                disabled={!isFormValid}
                loading={isGenerating}>
                Generate printable ecash papers
            </Button>
        </Form>
    )
}

const Form = styled('form', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    paddingTop: 8,
})

const SuggestionsList = styled('ul', {
    paddingLeft: 16,
})

const SuggestionButton = styled('button', {
    fontSize: theme.fontSizes.small,
    color: theme.colors.blue,
})
