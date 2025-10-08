import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useLnurlWithdraw } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { selectPaymentFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../bridge'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import { AmountScreen } from '../components/ui/AmountScreen'
import Flex from '../components/ui/Flex'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import { Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RedeemLnurlWithdraw'
>

const RedeemLnurlWithdraw: React.FC<Props> = ({ navigation, route }: Props) => {
    const lnurlw = route.params.parsedData
    const { t } = useTranslation()
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        setMemo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({
        lnurlWithdrawal: lnurlw.data,
        federationId: paymentFederation?.id,
    })
    const { isWithdrawing, handleWithdraw } = useLnurlWithdraw({
        fedimint,
        federationId: paymentFederation?.id,
        lnurlw,
        onWithdrawPaid: tx =>
            navigation.dispatch(
                reset('ReceiveSuccess', {
                    tx,
                }),
            ),
    })
    const toast = useToast()
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }

    const handleSubmit = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        try {
            await handleWithdraw(amount, memo)
        } catch (e) {
            toast.error(t, e)
        }
    }

    return (
        <SafeScrollArea edges="notop">
            <AmountScreen
                subHeader={<FederationWalletSelector />}
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                isSubmitting={isWithdrawing}
                readOnly={Boolean(exactAmount)}
                verb={t('words.redeem')}
                notes={memo}
                setNotes={setMemo}
                isIndependent
            />
            <Flex gap="md">
                <Button
                    title={`${t('words.redeem')}${
                        amount ? ` ${amountUtils.formatSats(amount)} ` : ' '
                    }${t('words.sats').toUpperCase()}`}
                    onPress={handleSubmit}
                    disabled={isWithdrawing}
                    loading={isWithdrawing}
                />
            </Flex>
        </SafeScrollArea>
    )
}

export default RedeemLnurlWithdraw
