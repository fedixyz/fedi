import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, StyleSheet } from 'react-native'

import { useDepositForm } from '@fedi/common/hooks/amount'
import { hexToRgba } from '@fedi/common/utils/color'

import { AmountScreen } from '../components/ui/AmountScreen'
import { Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityDeposit'
>

const StabilityDeposit: React.FC<Props> = ({ route }: Props) => {
    const navigation = useNavigation()
    const { federationId } = route.params

    const { theme } = useTheme()
    const { t } = useTranslation()
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        maximumFiatAmount,
    } = useDepositForm(federationId)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }
    const handleSubmit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }
        navigation.navigate('StabilityConfirmDeposit', {
            amount,
            federationId,
        })
        Keyboard.dismiss()
    }

    useSyncCurrencyRatesOnFocus(federationId)

    const style = styles(theme)

    return (
        <AmountScreen
            showBalance={true}
            federationId={federationId}
            amount={amount}
            onChangeAmount={onChangeAmount}
            minimumAmount={minimumAmount}
            maximumAmount={maximumAmount}
            submitAttempts={submitAttempts}
            switcherEnabled={false}
            lockToFiat={true}
            verb={t('words.deposit')}
            subHeader={
                <Text caption style={style.balance}>
                    {`${t('feature.stabilitypool.available-to-deposit')}: `}
                    {`${maximumFiatAmount} `}
                </Text>
            }
            buttons={[
                {
                    title: `${t('words.continue')}`,
                    onPress: handleSubmit,
                    disabled: amount === 0,
                },
            ]}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        balance: {
            color: hexToRgba(theme.colors.primary, 0.6),
            textAlign: 'center',
        },
    })

export default StabilityDeposit
