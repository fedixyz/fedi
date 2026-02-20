import { useNavigation } from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useMakeLightningRequest } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { reset } from '../../../state/navigation'
import { useRecheckInternet } from '../../../utils/hooks/environment'
import { AmountScreen } from '../../ui/AmountScreen'
import PaymentType from '../send/PaymentType'

export default function RequestLightningAmount({
    federationId,
}: {
    federationId?: string
}) {
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const recheckConnection = useRecheckInternet()
    const navigation = useNavigation()
    const toast = useToast()

    const { theme } = useTheme()
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        setMemo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({ federationId })
    const { t } = useTranslation()
    const { isInvoiceLoading, makeLightningRequest } = useMakeLightningRequest({
        federationId,
        onInvoicePaid(tx) {
            navigation.dispatch(
                reset('ReceiveSuccess', {
                    tx,
                }),
            )
        },
    })

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
                navigation.navigate('LightningRequestQr', {
                    invoice,
                    memo,
                    federationId,
                })
            }
        } catch (e) {
            toast.error(t, e)
        }
    }

    return (
        <ScrollView
            style={{
                flex: 1,
                paddingHorizontal: theme.spacing.xl,
            }}
            contentContainerStyle={{ flexGrow: 1 }}>
            <AmountScreen
                showBalance={true}
                federationId={federationId}
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                isSubmitting={isInvoiceLoading}
                readOnly={Boolean(exactAmount)}
                verb={t('words.request')}
                preHeader={<PaymentType type="lightning" />}
                buttons={[
                    {
                        title: `${t('words.request')}${
                            amount ? ` ${amountUtils.formatSats(amount)} ` : ' '
                        }${t('words.sats').toUpperCase()}`,
                        onPress: handleSubmit,
                        disabled: isInvoiceLoading,
                        loading: isInvoiceLoading,
                        containerStyle: {
                            width: '100%',
                        },
                    },
                ]}
                isIndependent={false}
                notes={memo}
                setNotes={setMemo}
            />
        </ScrollView>
    )
}
