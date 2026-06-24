import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, StyleSheet } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useMakeLightningRequest } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import PaymentType from '../components/feature/send/PaymentType'
import { AmountScreen } from '../components/ui/AmountScreen'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'
import { useRecheckInternet } from '../utils/hooks/environment'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'MerchantAmount'>

const MerchantAmount: React.FC<Props> = ({ route }) => {
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const { federationId } = route.params ?? {}

    const recheckConnection = useRecheckInternet()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const { theme } = useTheme()
    const { t } = useTranslation()

    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        setMemo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({ federationId })

    const { isInvoiceLoading, makeLightningRequest } = useMakeLightningRequest({
        federationId,
        onInvoicePaid(tx) {
            navigation.navigate('MerchantSuccess', {
                amountSats: amountUtils.msatToSat(tx.amount),
                federationId,
            })
        },
    })

    useSyncCurrencyRatesOnFocus(federationId)

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }

    const handleSubmit = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        const connection = await recheckConnection()
        if (connection.isOffline) {
            toast.error(t, t('errors.actions-require-internet'))
            return
        }

        Keyboard.dismiss()

        try {
            const invoice = await makeLightningRequest(amount, memo)
            if (invoice) {
                navigation.navigate('MerchantQr', {
                    invoice,
                    amountSats: amount,
                    federationId,
                })
            }
        } catch (e) {
            toast.error(t, e)
        }
    }

    const style = styles(theme)

    return (
        <ScrollView
            style={style.container}
            contentContainerStyle={style.content}>
            <AmountScreen
                subHeaderStyle={style.subHeader}
                federationId={federationId}
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                isSubmitting={isInvoiceLoading}
                readOnly={Boolean(exactAmount)}
                verb={t('feature.merchant.charge')}
                preHeader={<PaymentType type="lightning" />}
                buttons={[
                    {
                        testID: 'MerchantChargeButton',
                        title: `${t('feature.merchant.charge')}${
                            amount ? ` ${amountUtils.formatSats(amount)} ` : ' '
                        }${t('words.sats').toUpperCase()}`,
                        onPress: handleSubmit,
                        disabled: isInvoiceLoading,
                        loading: isInvoiceLoading,
                        containerStyle: { width: '100%' },
                    },
                ]}
                isIndependent={false}
                notes={memo}
                setNotes={setMemo}
            />
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            paddingHorizontal: theme.spacing.xl,
        },
        content: {
            flexGrow: 1,
        },
        subHeader: {
            paddingTop: 0,
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default MerchantAmount
