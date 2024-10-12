import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    useAmountFormatter,
    useBalanceDisplay,
} from '@fedi/common/hooks/amount'
import { useChatPaymentPush } from '@fedi/common/hooks/chat'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectMatrixRoom, selectPaymentFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../bridge'
import ChatAvatar from '../components/feature/chat/ChatAvatar'
import { FederationLogo } from '../components/feature/federations/FederationLogo'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendAmounts from '../components/feature/send/SendAmounts'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import { useAppSelector } from '../state/hooks'
import { resetToDirectChat } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmSendChatPayment'
>

const ConfirmSendChatPayment: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const { t } = useTranslation()
    const { amount, roomId } = route.params
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const { feeBreakdownTitle, ecashFeesGuidanceText, makeEcashFeeContent } =
        useFeeDisplayUtils(t)
    const { formattedTotalFee, feeItemsBreakdown } = makeEcashFeeContent(
        amountUtils.satToMsat(amount),
    )
    const balanceDisplay = useBalanceDisplay(t)
    const { makeFormattedAmountsFromSats } = useAmountFormatter()
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromSats(amount)

    const paymentFederation = useAppSelector(selectPaymentFederation)
    const existingRoom = useAppSelector(s => selectMatrixRoom(s, roomId))
    const { isProcessing, handleSendPayment } = useChatPaymentPush(
        t,
        fedimint,
        roomId,
        existingRoom?.directUserId || '',
    )

    const onSend = useCallback(async () => {
        handleSendPayment(amount, () => {
            // go back to DirectChat to show sent payment
            navigation.dispatch(resetToDirectChat(roomId))
        })
    }, [amount, handleSendPayment, navigation, roomId])

    const style = styles(theme, insets)

    return (
        <View style={style.container}>
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
                                    displayName: existingRoom.name,
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
        </View>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            paddingTop: theme.spacing.lg,
            paddingLeft: theme.spacing.lg + insets.left,
            paddingRight: theme.spacing.lg + insets.right,
            paddingBottom: Math.max(theme.spacing.lg, insets.bottom),
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
