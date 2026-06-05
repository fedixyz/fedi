import { useRouter } from 'next/router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
import { selectLoadedFederation } from '@fedi/common/redux'

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
import { ConfirmWithdrawDialog } from './ConfirmWithdrawDialog'

export function StabilityWithdraw() {
    const { t } = useTranslation()
    const { push, query } = useRouter()

    const federationId = typeof query.id === 'string' ? query.id : ''
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [showConfirmWithdraw, setShowConfirmWithdraw] = useState(false)
    const [successFormattedAmount, setSuccessFormattedAmount] = useState<
        string | null
    >(null)

    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        inputAmountCents,
    } = useWithdrawForm(federationId)

    const isValidAmount =
        (minimumAmount === 0
            ? amount > minimumAmount
            : amount >= minimumAmount) && amount <= maximumAmount

    const handleOnWithdraw = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (!isValidAmount) return

        setShowConfirmWithdraw(true)
    }

    if (successFormattedAmount) {
        return (
            <SuccessShield
                title={t('feature.stabilitypool.withdrawn')}
                formattedAmount={successFormattedAmount}
                description={t(
                    'feature.stabilitypool.withdrawal-success-description',
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
                            {t('feature.stabilitypool.send-to-my-btc-wallet')}
                        </Layout.Title>
                    </Layout.Header>
                    <Layout.Content fullWidth>
                        <Content gap="lg" fullWidth>
                            {federation && (
                                <StabilityWalletSwitcher
                                    federation={federation}
                                    badgeLogo="usd"
                                    showSwitcher={false}
                                />
                            )}
                            <AmountInput
                                amount={amount}
                                minimumAmount={minimumAmount}
                                maximumAmount={maximumAmount}
                                onChangeAmount={setAmount}
                                submitAttempts={submitAttempts}
                                federationId={federationId}
                                lockToFiat
                                switcherEnabled={false}
                                verb={t('words.withdraw')}
                            />
                        </Content>
                    </Layout.Content>
                    <Layout.Actions>
                        <Button
                            width="full"
                            disabled={!isValidAmount}
                            onClick={handleOnWithdraw}>
                            {t('words.next')}
                        </Button>
                    </Layout.Actions>
                </Layout.Root>
            </ContentBlock>

            <ConfirmWithdrawDialog
                open={showConfirmWithdraw}
                onOpenChange={setShowConfirmWithdraw}
                federationId={federationId}
                amountSats={amount}
                amountCents={inputAmountCents}
                onSuccess={formattedAmount => {
                    setShowConfirmWithdraw(false)
                    setSuccessFormattedAmount(formattedAmount)
                }}
            />
        </>
    )
}

const Content = styled(Column, {
    padding: `0 ${theme.spacing.lg}`,
})
