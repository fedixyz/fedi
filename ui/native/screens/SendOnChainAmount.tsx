import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { selectPaymentFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../bridge'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
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
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { parsedData } = route.params
    const [notes, setNotes] = useState<string>('')

    const {
        isReadyToPay,
        minimumAmount,
        maximumAmount,
        inputAmount,
        setInputAmount,
        handleOmniInput,
        exactAmount,
    } = useOmniPaymentState(fedimint, paymentFederation?.id, true, t)

    useEffect(() => {
        handleOmniInput(parsedData)
    }, [handleOmniInput, parsedData])

    const [submitAttempts, setSubmitAttempts] = useState(0)

    const navigationPush = navigation.push
    const handleContinue = useCallback(async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (
            inputAmount > maximumAmount ||
            inputAmount < minimumAmount ||
            !paymentFederation
        )
            return

        try {
            await fedimint.previewPayAddress(
                parsedData.data.address,
                inputAmount,
                paymentFederation?.id,
            )

            navigationPush('ConfirmSendOnChain', {
                parsedData: {
                    type: ParserDataType.Bip21,
                    data: {
                        address: parsedData.data.address,
                        amount: amountUtils.satToBtc(inputAmount),
                    },
                },
                notes,
            })
        } catch (err) {
            toast.error(t, err)
        }
    }, [
        inputAmount,
        minimumAmount,
        maximumAmount,
        navigationPush,
        parsedData.data.address,
        paymentFederation,
        toast,
        t,
        notes,
    ])

    if (!isReadyToPay) return <ActivityIndicator />

    return (
        <AmountScreen
            subHeader={<FederationWalletSelector />}
            amount={inputAmount}
            onChangeAmount={setInputAmount}
            minimumAmount={minimumAmount}
            maximumAmount={maximumAmount}
            submitAttempts={submitAttempts}
            // Readonly For Bip21 URIs
            readOnly={!!exactAmount}
            buttons={[
                {
                    title: t('words.continue'),
                    onPress: handleContinue,
                },
            ]}
            notes={notes}
            setNotes={setNotes}
        />
    )
}

export default SendOnChainAmount
