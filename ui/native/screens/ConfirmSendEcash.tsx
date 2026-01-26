import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Keyboard, StyleSheet } from 'react-native'

import { useAmountFormatter, useBalance } from '@fedi/common/hooks/amount'
import { useSendEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectPaymentFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { hexToRgba } from '@fedi/common/utils/color'
import { makeLog } from '@fedi/common/utils/log'

import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import PaymentType from '../components/feature/send/PaymentType'
import SendAmounts from '../components/feature/send/SendAmounts'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ConfirmSendEcash')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmSendEcash'
>

const ConfirmSendEcash: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { amount, notes = null } = route.params
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { formattedBalanceText } = useBalance(t, paymentFederation?.id || '')
    const { feeBreakdownTitle, ecashFeesGuidanceText, makeEcashFeeContent } =
        useFeeDisplayUtils(t, paymentFederation?.id || '')
    const { formattedTotalFee, feeItemsBreakdown } = makeEcashFeeContent(
        amountUtils.satToMsat(amount),
    )
    const { makeFormattedAmountsFromSats } = useAmountFormatter({
        federationId: paymentFederation?.id,
    })
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromSats(amount)
    const toast = useToast()

    const { generateEcash, isGeneratingEcash } = useSendEcash(
        paymentFederation?.id || '',
    )

    const handleSend = useCallback(async () => {
        Keyboard.dismiss()
        try {
            const res = await generateEcash(amount, notes ?? undefined)
            if (res) {
                navigation.dispatch(
                    reset('SendOfflineQr', {
                        ecash: res.ecash,
                        amount: amountUtils.satToMsat(amount),
                    }),
                )
            }
        } catch (error) {
            log.error('onGenerateEcash', error)
            // Now that we have fees when sending ecash
            // We need to notify the user if they have an insufficient balance to send the desired amount
            toast.error(t, error)
        }
    }, [amount, notes, navigation, toast, t, generateEcash])

    const handleConfirm = useCallback(() => {
        Alert.alert(
            t('phrases.please-confirm'),
            t('feature.send.offline-send-warning'),
            [
                {
                    text: t('phrases.go-back'),
                },
                {
                    text: t('words.continue'),
                    onPress: handleSend,
                },
            ],
        )
    }, [handleSend, t])

    const style = styles(theme)

    return (
        <SafeAreaContainer style={style.container} edges="notop">
            <FederationWalletSelector />
            <Column style={style.amountContainer}>
                <PaymentType type="ecash" />
                <SendAmounts
                    balanceDisplay={formattedBalanceText}
                    formattedPrimaryAmount={formattedPrimaryAmount}
                    formattedSecondaryAmount={formattedSecondaryAmount}
                />
            </Column>
            <SendPreviewDetails
                onPressFees={() => setShowFeeBreakdown(true)}
                formattedTotalFee={formattedTotalFee}
                onSend={handleConfirm}
                isLoading={isGeneratingEcash}
                senderText={t('feature.stabilitypool.bitcoin-balance')}
            />
            <FeeOverlay
                show={showFeeBreakdown}
                onDismiss={() => setShowFeeBreakdown(false)}
                title={feeBreakdownTitle}
                feeItems={feeItemsBreakdown}
                description={ecashFeesGuidanceText}
            />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            paddingTop: theme.spacing.lg,
        },
        amountContainer: {
            marginTop: 'auto',
        },
        balance: {
            color: hexToRgba(theme.colors.primary, 0.6),
            textAlign: 'center',
        },
    })

export default ConfirmSendEcash
