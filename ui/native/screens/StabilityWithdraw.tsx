import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, StyleSheet } from 'react-native'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
import { fetchCurrencyPrices } from '@fedi/common/redux'
import { hexToRgba } from '@fedi/common/utils/color'

import { AmountScreen } from '../components/ui/AmountScreen'
import { useAppDispatch } from '../state/hooks'
import { Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityWithdraw'
>

const StabilityWithdraw: React.FC<Props> = () => {
    const navigation = useNavigation()
    const { theme } = useTheme()
    const { t } = useTranslation()
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        maximumFiatAmount,
    } = useWithdrawForm()
    const dispatch = useAppDispatch()
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
        navigation.navigate('StabilityConfirmWithdraw', {
            amount,
        })
        Keyboard.dismiss()
    }

    useEffect(() => {
        dispatch(fetchCurrencyPrices())
    }, [dispatch])

    const style = styles(theme)

    return (
        <AmountScreen
            amount={amount}
            onChangeAmount={onChangeAmount}
            minimumAmount={minimumAmount}
            maximumAmount={maximumAmount}
            submitAttempts={submitAttempts}
            switcherEnabled={false}
            lockToFiat={true}
            verb={t('words.withdraw')}
            subHeader={
                <Text caption style={style.balance}>
                    {`${t('feature.stabilitypool.available-to-withdraw')}: `}
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

export default StabilityWithdraw
