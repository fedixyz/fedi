import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../bridge'
import { AmountScreen } from '../components/ui/AmountScreen'
import { useAppSelector } from '../state/hooks'
import { ParserDataType } from '../types'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SendOnChainAmount'
>

const SendOnChainAmount: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const { parsedData } = route.params

    const {
        isReadyToPay,
        minimumAmount,
        maximumAmount,
        inputAmount,
        setInputAmount,
        handleOmniInput,
    } = useOmniPaymentState(fedimint, activeFederation?.id)

    useEffect(() => {
        handleOmniInput(parsedData)
    }, [handleOmniInput, parsedData])

    const [submitAttempts, setSubmitAttempts] = useState(0)

    const navigationPush = navigation.push
    const handleContinue = useCallback(async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (inputAmount > maximumAmount || inputAmount < minimumAmount) return

        try {
            navigationPush('ConfirmSendOnChain', {
                parsedData: {
                    type: ParserDataType.Bip21,
                    data: {
                        address: parsedData.data.address,
                        amount: amountUtils.satToBtc(inputAmount),
                    },
                },
            })
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
    }, [
        inputAmount,
        minimumAmount,
        maximumAmount,
        navigationPush,
        parsedData.data.address,
        toast,
        t,
    ])

    if (!isReadyToPay) return <ActivityIndicator />

    return (
        <AmountScreen
            showBalance
            amount={inputAmount}
            onChangeAmount={setInputAmount}
            minimumAmount={minimumAmount}
            maximumAmount={maximumAmount}
            submitAttempts={submitAttempts}
            buttons={[
                {
                    title: t('words.continue'),
                    onPress: handleContinue,
                },
            ]}
        />
    )
}

export default SendOnChainAmount
