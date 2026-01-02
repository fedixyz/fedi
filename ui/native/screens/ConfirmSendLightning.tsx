import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import {
    selectIsInternetUnreachable,
    selectPaymentFederation,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import InternetUnreachableBanner from '../components/feature/environment/InternetUnreachableBanner'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import { AmountScreen } from '../components/ui/AmountScreen'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { NavigationHook, RootStackParamList } from '../types/navigation'
import { useRecheckInternet } from '../utils/hooks/environment'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmSendLightning'
>

const ConfirmSendLightning: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { feeBreakdownTitle, makeLightningFeeContent } = useFeeDisplayUtils(
        t,
        paymentFederation?.id || '',
    )
    const [notes, setNotes] = useState<string>('')
    const { parsedData } = route.params
    const isOffline = useAppSelector(selectIsInternetUnreachable)
    const recheckConnection = useRecheckInternet()
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
    } = useOmniPaymentState(paymentFederation?.id, t)

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

        const conn = await recheckConnection()

        if (conn.isOffline) {
            toast.error(t, t('errors.actions-require-internet'))
            return
        }

        setIsPayingInvoice(true)
        try {
            await handleOmniSend(inputAmount, notes || undefined)
            navigationReplace('SendSuccess', {
                amount: amountUtils.satToMsat(inputAmount),
                unit,
            })
        } catch (err) {
            toast.error(t, err)
        }
        setIsPayingInvoice(false)
    }, [
        recheckConnection,
        handleOmniSend,
        inputAmount,
        minimumAmount,
        maximumAmount,
        unit,
        navigationReplace,
        toast,
        t,
        notes,
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

    return (
        <>
            {isOffline && <InternetUnreachableBanner />}
            <AmountScreen
                subHeader={<FederationWalletSelector />}
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
                                          color={theme.colors.secondary}>
                                          {t('words.send')}
                                      </Text>
                                  ),
                                  onPress: handleSend,
                                  loading: isPayingInvoice,
                                  disabled: isPayingInvoice || isOffline,
                              },
                          ]
                        : []
                }
                notes={notes}
                setNotes={setNotes}
            />
        </>
    )
}

export default ConfirmSendLightning
