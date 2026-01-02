import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, StyleSheet } from 'react-native'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'

import StabilityBalanceTile from '../components/feature/stabilitypool/StabilityBalanceTile'
import { AmountScreen } from '../components/ui/AmountScreen'
import { Row } from '../components/ui/Flex'
import { Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityTransfer'
>

const StabilityTransfer: React.FC<Props> = ({ route }: Props) => {
    const { recipient: lockedRecipient, federationId } = route.params

    const navigation = useNavigation()
    const { t } = useTranslation()
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        inputAmountCents,
    } = useWithdrawForm(federationId)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }

    const handleSubmit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        if (lockedRecipient) {
            navigation.navigate('StabilityConfirmTransfer', {
                recipient: lockedRecipient,
                amount: inputAmountCents,
                federationId,
                notes,
            })
        } else {
            navigation.navigate('StabilityConfirmWithdraw', {
                amountSats: amount,
                amountCents: inputAmountCents,
                federationId,
            })
        }
        Keyboard.dismiss()
    }

    useFocusEffect(
        useCallback(() => {
            syncCurrencyRatesAndCache()
        }, [syncCurrencyRatesAndCache]),
    )

    const [notes, setNotes] = useState('')

    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <>
            <AmountScreen
                subHeader={
                    <Row
                        align="stretch"
                        fullWidth
                        style={style.subHeaderContainer}>
                        <StabilityBalanceTile federationId={federationId} />
                    </Row>
                }
                federationId={federationId}
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                switcherEnabled={false}
                lockToFiat={true}
                verb={t('words.transfer')}
                buttons={[
                    {
                        title: t('words.confirm'),
                        onPress: handleSubmit,
                        disabled: amount === 0,
                    },
                ]}
                notes={notes}
                setNotes={setNotes}
            />
        </>
    )
}

export default StabilityTransfer

const styles = (theme: Theme) =>
    StyleSheet.create({
        subHeaderContainer: {
            // 1 px to align with the next screen...
            // Thinking it's due to the SafeAreaView behavior on the
            // confirm screen. Not sure. This fixes it for now.
            paddingHorizontal: theme.spacing.lg - 1,
        },
    })
