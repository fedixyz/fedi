import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Keyboard, StyleSheet } from 'react-native'

import {
    useAmountFormatter,
    useBalanceDisplay,
} from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { generateEcash, selectPaymentFederation } from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { hexToRgba } from '@fedi/common/utils/color'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendAmounts from '../components/feature/send/SendAmounts'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
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
    const dispatch = useAppDispatch()
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const balanceDisplay = useBalanceDisplay(t)
    const { feeBreakdownTitle, ecashFeesGuidanceText, makeEcashFeeContent } =
        useFeeDisplayUtils(t)
    const { formattedTotalFee, feeItemsBreakdown } = makeEcashFeeContent(
        amountUtils.satToMsat(amount),
    )
    const { makeFormattedAmountsFromSats } = useAmountFormatter()
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromSats(amount)
    const toast = useToast()

    const handleSend = useCallback(async () => {
        Keyboard.dismiss()
        setIsLoading(true)
        try {
            if (!paymentFederation?.id) throw new Error('No payment federation')
            const millis = amountUtils.satToMsat(Number(amount) as Sats)
            const { ecash } = await dispatch(
                generateEcash({
                    fedimint,
                    federationId: paymentFederation?.id,
                    amount: millis,
                    includeInvite: true,
                    frontendMetadata: {
                        initialNotes: notes,
                        recipientMatrixId: null,
                        senderMatrixId: null,
                    },
                }),
            ).unwrap()
            navigation.dispatch(
                reset('SendOfflineQr', { ecash, amount: millis }),
            )
        } catch (error) {
            log.error('onGenerateEcash', error)
            // Now that we have fees when sending ecash
            // We need to notify the user if they have an insufficient balance to send the desired amount
            toast.error(t, error)
        }
        setIsLoading(false)
    }, [paymentFederation?.id, amount, dispatch, notes, navigation, toast, t])

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
            <SendAmounts
                balanceDisplay={balanceDisplay}
                formattedPrimaryAmount={formattedPrimaryAmount}
                formattedSecondaryAmount={formattedSecondaryAmount}
            />
            <SendPreviewDetails
                onPressFees={() => setShowFeeBreakdown(true)}
                formattedTotalFee={formattedTotalFee}
                onSend={handleConfirm}
                isLoading={isLoading}
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
        secondaryAmountText: {
            color: theme.colors.darkGrey,
            textAlign: 'center',
            marginRight: theme.spacing.xs,
            marginTop: theme.spacing.xs,
        },
    })

export default ConfirmSendEcash
