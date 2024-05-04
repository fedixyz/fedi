import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMinMaxSendAmount } from '@fedi/common/hooks/amount'

import { AmountScreen } from '../components/ui/AmountScreen'
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

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }

    const onNext = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount < minimumAmount || amount > maximumAmount) {
            return
        }
        navigation.navigate('ConfirmSendEcash', { amount })
    }

    return (
        <AmountScreen
            showBalance
            amount={amount}
            onChangeAmount={onChangeAmount}
            minimumAmount={minimumAmount}
            maximumAmount={maximumAmount}
            submitAttempts={submitAttempts}
            verb={t('words.send')}
            buttons={[
                {
                    title: t('words.next'),
                    onPress: onNext,
                },
            ]}
        />
    )
}

export default SendOfflineAmount
