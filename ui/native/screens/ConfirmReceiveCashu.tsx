import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useCommonSelector } from '@fedi/common/hooks/redux'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectPaymentFederation } from '@fedi/common/redux'
import type { Sats, Transaction } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { BridgeError } from '@fedi/common/utils/fedimint'
import { fedimint } from '@fedi/native/bridge'

import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import { AmountScreen } from '../components/ui/AmountScreen'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmReceiveCashu'
>

const ConfirmReceiveCashu: React.FC<Props> = ({ route, navigation }: Props) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const { t } = useTranslation()
    const toast = useToast()
    const { parsedData } = route.params

    const activeWalletFederationId =
        useCommonSelector(selectPaymentFederation)?.id ?? ''
    const { feeBreakdownTitle, makeLightningFeeContent } = useFeeDisplayUtils(t)
    const [isPayingInvoice, setIsPayingInvoice] = useState<boolean>(false)
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const {
        isReadyToPay,
        exactAmount,
        description,
        feeDetails,
        sendTo,
        handleOmniInput,
        handleOmniSend,
    } = useOmniPaymentState(fedimint, activeWalletFederationId, true, t)

    const { formattedTotalFee, feeItemsBreakdown } = useMemo(() => {
        return feeDetails
            ? makeLightningFeeContent(feeDetails)
            : { feeItemsBreakdown: [], formattedTotalFee: '' }
    }, [feeDetails, makeLightningFeeContent])

    useEffect(() => {
        try {
            handleOmniInput(parsedData)
        } catch (err) {
            if (err instanceof BridgeError) {
                toast.error(t, null, err.format(t))
            } else {
                toast.error(t, err)
            }
        }
    }, [handleOmniInput, parsedData, t, toast])

    const navigationReplace = navigation.replace
    const handleSend = useCallback(async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (!exactAmount) return
        setIsPayingInvoice(true)
        try {
            await handleOmniSend(exactAmount)
            navigationReplace('ReceiveSuccess', {
                tx: {
                    amount: amountUtils.satToMsat(exactAmount),
                } as Transaction,
            })
        } catch (err) {
            if (err instanceof BridgeError) {
                toast.error(t, null, err.format(t))
            } else {
                toast.error(t, err)
            }
        }
        setIsPayingInvoice(false)
    }, [handleOmniSend, exactAmount, navigationReplace, toast, t])

    if (!isReadyToPay)
        return (
            <View style={style.loadingContainer}>
                <Text style={style.loadingText}>{t('words.loading')}</Text>
                <ActivityIndicator />
            </View>
        )

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
            <AmountScreen
                amount={exactAmount ?? (0 as Sats)}
                submitAttempts={submitAttempts}
                isSubmitting={isPayingInvoice}
                readOnly={true}
                description={description}
                subContent={renderDetails()}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        loadingContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.xl,
        },
        loadingText: {
            color: theme.colors.secondary,
        },
        buttonText: {
            color: theme.colors.secondary,
        },
    })

export default ConfirmReceiveCashu
