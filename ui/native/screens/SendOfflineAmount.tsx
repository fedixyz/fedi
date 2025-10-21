import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMinMaxSendAmount } from '@fedi/common/hooks/amount'
import { selectPaymentFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../bridge'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import { AmountScreen } from '../components/ui/AmountScreen'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SendOfflineAmount'
>

const SendOfflineAmount: React.FC<Props> = () => {
    const navigation = useNavigation()
    const { t } = useTranslation()
    const [amount, setAmount] = useState(0 as Sats)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const { minimumAmount, maximumAmount } = useMinMaxSendAmount()
    const [maxSendEcashAmount, setMaxSendEcashAmount] =
        useState<Sats>(maximumAmount)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const [notes, setNotes] = useState('')

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }

    const onNext = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount < minimumAmount || amount > maximumAmount) {
            return
        }
        navigation.navigate('ConfirmSendEcash', { amount, notes })
    }

    useEffect(() => {
        if (!paymentFederation) return

        fedimint
            .calculateMaxGenerateEcash(paymentFederation.id)
            .then(max => setMaxSendEcashAmount(amountUtils.msatToSat(max)))
            .catch(() => setMaxSendEcashAmount(maximumAmount))
    }, [amount, maximumAmount, paymentFederation])

    return (
        <SafeScrollArea edges="none">
            <AmountScreen
                subHeader={<FederationWalletSelector />}
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={
                    Math.min(maxSendEcashAmount, maximumAmount) as Sats
                }
                submitAttempts={submitAttempts}
                verb={t('words.send')}
                buttons={[
                    {
                        title: t('words.next'),
                        onPress: onNext,
                    },
                ]}
                notes={notes}
                setNotes={setNotes}
                federationId={paymentFederation?.id}
            />
        </SafeScrollArea>
    )
}

export default SendOfflineAmount
