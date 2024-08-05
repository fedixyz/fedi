import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectActiveFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { BridgeError } from '@fedi/common/utils/fedimint'

import { fedimint } from '../bridge'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import { AmountScreen } from '../components/ui/AmountScreen'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmSendLightning'
>

const ConfirmSendLightning: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const { feeBreakdownTitle, makeLightningFeeContent } = useFeeDisplayUtils(t)
    const { parsedData } = route.params
    const {
        isReadyToPay,
        exactAmount,
        minimumAmount,
        maximumAmount,
        inputAmount,
        description,
        feeDetails,
        sendTo,
        setInputAmount,
        handleOmniInput,
        handleOmniSend,
    } = useOmniPaymentState(fedimint, activeFederation?.id)

    const { formattedTotalFee, feeItemsBreakdown } = useMemo(() => {
        return feeDetails
            ? makeLightningFeeContent(feeDetails)
            : { feeItemsBreakdown: [], formattedTotalFee: '' }
    }, [feeDetails, makeLightningFeeContent])

    useEffect(() => {
        handleOmniInput(parsedData)
    }, [handleOmniInput, parsedData])

    const [unit] = useState('sats')
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)

    const [isPayingInvoice, setIsPayingInvoice] = useState<boolean>(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const navigationReplace = navigation.replace
    const handleSend = useCallback(async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (inputAmount > maximumAmount || inputAmount < minimumAmount) return

        setIsPayingInvoice(true)
        try {
            await handleOmniSend(inputAmount)
            navigationReplace('SendSuccess', {
                amount: amountUtils.satToMsat(inputAmount),
                unit,
            })
        } catch (err) {
            if (err instanceof BridgeError) {
                toast.error(t, null, err.format(t))
            } else {
                toast.error(t, err)
            }
        }
        setIsPayingInvoice(false)
    }, [
        handleOmniSend,
        inputAmount,
        minimumAmount,
        maximumAmount,
        unit,
        navigationReplace,
        toast,
        t,
    ])

    if (!isReadyToPay) return <ActivityIndicator />

    const renderDetails = () => {
        if (!feeDetails) return null

        return (
            <>
                <SendPreviewDetails
                    onPressFees={() => setShowFeeBreakdown(true)}
                    formattedTotalFee={formattedTotalFee}
                    onSend={handleSend}
                    senderText={t('feature.stabilitypool.bitcoin-balance')}
                    receiverText={sendTo ?? ''}
                    isLoading={isPayingInvoice}
                />

                <FeeOverlay
                    show={showFeeBreakdown}
                    onDismiss={() => setShowFeeBreakdown(false)}
                    title={feeBreakdownTitle}
                    feeItems={feeItemsBreakdown}
                    description={
                        <Trans
                            t={t}
                            i18nKey="feature.fees.guidance-lightning"
                            components={{
                                br: <LineBreak />,
                            }}
                        />
                    }
                    icon={
                        <SvgImage
                            name="Info"
                            size={32}
                            color={theme.colors.orange}
                        />
                    }
                />
            </>
        )
    }
    const style = styles(theme)

    return (
        <>
            <AmountScreen
                showBalance
                amount={inputAmount}
                onChangeAmount={setInputAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                isSubmitting={isPayingInvoice}
                readOnly={!!exactAmount}
                description={description}
                subContent={renderDetails()}
                buttons={
                    !exactAmount
                        ? [
                              {
                                  title: (
                                      <Text
                                          medium
                                          caption
                                          style={style.buttonText}>
                                          {t('words.send')}
                                      </Text>
                                  ),
                                  onPress: handleSend,
                                  loading: isPayingInvoice,
                                  disabled: isPayingInvoice,
                              },
                          ]
                        : []
                }
            />
        </>
    )
}

export default ConfirmSendLightning

const styles = (theme: Theme) =>
    StyleSheet.create({
        buttonText: {
            color: theme.colors.secondary,
        },
    })
