import { useRouter } from 'next/router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    useAmountFormatter,
    useStabilityDepositForm,
} from '@fedi/common/hooks/amount'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import { selectLoadedFederation } from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'

import { walletRoute } from '../../../constants/routes'
import { useAppSelector } from '../../../hooks'
import { styled, theme } from '../../../styles'
import { AmountInput } from '../../AmountInput'
import { Button } from '../../Button'
import { ContentBlock } from '../../ContentBlock'
import { Column } from '../../Flex'
import * as Layout from '../../Layout'
import { StabilityWalletSwitcher } from '../../StabilityWalletSwitcher'
import { SuccessShield } from '../SuccessShield'
import { ConfirmDepositDialog } from './ConfirmDepositDialog'

export function StabilityDeposit() {
    const { t } = useTranslation()
    const { push, query } = useRouter()

    const federationId = typeof query.id === 'string' ? query.id : ''
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    useMonitorStabilityPool(federationId)

    const [showConfirmDeposit, setShowConfirmDeposit] = useState(false)
    const [success, setSuccess] = useState(false)
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        submitAttempts,
        setSubmitAttempts,
        isValidAmount,
    } = useStabilityDepositForm(federationId)
    const { makeFormattedAmountsFromSats } = useAmountFormatter({
        federationId,
    })
    const { formattedUsd } = makeFormattedAmountsFromSats(amount, 'end')

    const handleOnDeposit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (!isValidAmount) return

        setShowConfirmDeposit(true)
    }

    const handleOnChangeAmount = (newAmount: Sats) => {
        setAmount(newAmount)
    }

    if (success) {
        return (
            <SuccessShield
                title={t('feature.stabilitypool.deposited')}
                formattedAmount={formattedUsd}
                description={t(
                    'feature.stabilitypool.deposit-success-description',
                )}
                buttonText={t('words.ok')}
                onClick={() => push(walletRoute)}
            />
        )
    }

    return (
        <>
            <ContentBlock>
                <Layout.Root>
                    <Layout.Header back>
                        <Layout.Title subheader>
                            {t(
                                'feature.stabilitypool.receive-from-my-btc-wallet',
                            )}
                        </Layout.Title>
                    </Layout.Header>
                    <Layout.Content fullWidth>
                        <Content gap="lg" fullWidth>
                            {federation && (
                                <StabilityWalletSwitcher
                                    federation={federation}
                                    badgeLogo="btc"
                                    showSwitcher={false}
                                />
                            )}
                            <AmountInput
                                amount={amount}
                                minimumAmount={minimumAmount}
                                maximumAmount={maximumAmount}
                                onChangeAmount={handleOnChangeAmount}
                                submitAttempts={submitAttempts}
                                federationId={federationId}
                                lockToFiat
                                switcherEnabled={false}
                                verb={t('words.deposit')}
                            />
                        </Content>
                    </Layout.Content>
                    <Layout.Actions>
                        <Button
                            width="full"
                            disabled={!isValidAmount}
                            onClick={handleOnDeposit}>
                            {t('words.next')}
                        </Button>
                    </Layout.Actions>
                </Layout.Root>
            </ContentBlock>

            <ConfirmDepositDialog
                open={showConfirmDeposit}
                onOpenChange={setShowConfirmDeposit}
                federationId={federationId}
                amount={amount}
                onSuccess={() => {
                    setShowConfirmDeposit(false)
                    setSuccess(true)
                }}
            />
        </>
    )
}

const Content = styled(Column, {
    padding: `0 ${theme.spacing.lg}`,
})
