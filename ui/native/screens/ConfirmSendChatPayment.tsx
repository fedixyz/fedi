import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
    useAmountFormatter,
    useBalanceDisplay,
} from '@fedi/common/hooks/amount'
import { useChatPaymentPush } from '@fedi/common/hooks/chat'
import { useCommonSelector } from '@fedi/common/hooks/redux'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import {
    selectCurrency,
    selectMatrixRoom,
    selectPaymentFederation,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../bridge'
import ChatAvatar from '../components/feature/chat/ChatAvatar'
import { FederationLogo } from '../components/feature/federations/FederationLogo'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendAmounts from '../components/feature/send/SendAmounts'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { resetToDirectChat } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmSendChatPayment'
>

const ConfirmSendChatPayment: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { amount, roomId, notes } = route.params
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { feeBreakdownTitle, ecashFeesGuidanceText, makeEcashFeeContent } =
        useFeeDisplayUtils(t, paymentFederation?.id || '')
    const { formattedTotalFee, feeItemsBreakdown } = makeEcashFeeContent(
        amountUtils.satToMsat(amount),
    )
    const balanceDisplay = useBalanceDisplay(t, paymentFederation?.id || '')
    const selectedCurrency = useCommonSelector(s =>
        selectCurrency(s, paymentFederation?.id),
    )
    const { makeFormattedAmountsFromSats } = useAmountFormatter({
        currency: selectedCurrency,
        federationId: paymentFederation?.id,
    })
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromSats(amount)

    const existingRoom = useAppSelector(s => selectMatrixRoom(s, roomId))
    const { isProcessing, handleSendPayment } = useChatPaymentPush(
        t,
        fedimint,
        roomId,
        existingRoom?.directUserId || '',
    )

    const onSend = useCallback(async () => {
        handleSendPayment(
            amount,
            () => {
                // go back to DirectChat to show sent payment
                navigation.dispatch(resetToDirectChat(roomId))
            },
            notes,
        )
    }, [amount, handleSendPayment, navigation, notes, roomId])

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
                onSend={onSend}
                isLoading={isProcessing}
                senderText={
                    paymentFederation && (
                        <View style={style.sendFrom}>
                            <FederationLogo
                                federation={paymentFederation}
                                size={16}
                            />

                            <Text
                                caption
                                numberOfLines={1}
                                style={style.darkGrey}>
                                {paymentFederation?.name || ''}
                            </Text>
                        </View>
                    )
                }
                receiverText={
                    existingRoom ? (
                        <View style={style.sendFrom}>
                            <ChatAvatar
                                user={{
                                    ...existingRoom,
                                    displayName: existingRoom.name ?? '',
                                    avatarUrl:
                                        existingRoom.avatarUrl ?? undefined,
                                }}
                            />
                            <Text caption style={style.darkGrey}>
                                {existingRoom.name}
                            </Text>
                        </View>
                    ) : (
                        t('feature.chat.unknown-member')
                    )
                }
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
        darkGrey: {
            color: theme.colors.darkGrey,
        },
        sendFrom: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
    })

export default ConfirmSendChatPayment
