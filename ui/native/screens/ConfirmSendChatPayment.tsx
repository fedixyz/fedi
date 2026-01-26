import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Divider, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useAmountFormatter, useBalance } from '@fedi/common/hooks/amount'
import { useChatPaymentPush } from '@fedi/common/hooks/chat'
import { useCommonSelector } from '@fedi/common/hooks/redux'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import {
    selectCurrency,
    selectMatrixRoom,
    selectPaymentFederation,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import ChatAvatar from '../components/feature/chat/ChatAvatar'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import PaymentType from '../components/feature/send/PaymentType'
import SendAmounts from '../components/feature/send/SendAmounts'
import { AvatarSize } from '../components/ui/Avatar'
import { Column, Row } from '../components/ui/Flex'
import NotesInput from '../components/ui/NotesInput'
import { PressableIcon } from '../components/ui/PressableIcon'
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
    const { amount, roomId, notes: initialNotes } = route.params
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const [notes, setNotes] = useState(initialNotes ?? '')
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { feeBreakdownTitle, ecashFeesGuidanceText, makeEcashFeeContent } =
        useFeeDisplayUtils(t, paymentFederation?.id || '')
    const { formattedTotalFee, feeItemsBreakdown, formattedTotalAmount } =
        makeEcashFeeContent(amountUtils.satToMsat(amount))
    const { formattedBalanceText } = useBalance(t, paymentFederation?.id || '')
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
            <Column style={style.content} fullWidth align="center" grow>
                <Column style={style.amountContainer} align="center" fullWidth>
                    <PaymentType type="ecash" />
                    <SendAmounts
                        balanceDisplay={formattedBalanceText}
                        formattedPrimaryAmount={formattedPrimaryAmount}
                        formattedSecondaryAmount={formattedSecondaryAmount}
                    />
                </Column>
                <Column fullWidth>
                    {existingRoom && (
                        <>
                            <Row
                                align="center"
                                justify="between"
                                style={style.item}>
                                <Text caption bold>
                                    {t('feature.send.send-to')}
                                </Text>
                                <Row align="center" gap="sm">
                                    <ChatAvatar
                                        user={{
                                            ...existingRoom,
                                            displayName:
                                                existingRoom.name ?? '',
                                            avatarUrl:
                                                existingRoom.avatarUrl ??
                                                undefined,
                                        }}
                                        size={AvatarSize.sm}
                                    />
                                    <Text caption medium>
                                        {existingRoom.name}
                                    </Text>
                                </Row>
                            </Row>
                            <Divider />
                        </>
                    )}
                    <Row align="center" justify="between" style={style.item}>
                        <Text caption bold>
                            {t('words.federation')}
                        </Text>
                        <Text caption medium>
                            {paymentFederation?.name}
                        </Text>
                    </Row>
                    <Divider />
                    <Column style={style.itemGroup} gap="md">
                        <Row align="center" justify="between">
                            <Text caption>{t('words.amount')}</Text>
                            <Text caption medium>
                                {formattedPrimaryAmount}
                            </Text>
                        </Row>
                        <Row align="center" justify="between">
                            <Text caption>{t('words.fees')}</Text>
                            <Row align="center" gap="xs">
                                <Text caption medium>
                                    {formattedTotalFee}
                                </Text>
                                <PressableIcon
                                    svgName="Info"
                                    onPress={() => setShowFeeBreakdown(true)}
                                    svgProps={{
                                        size: 16,
                                        color: theme.colors.grey,
                                    }}
                                />
                            </Row>
                        </Row>
                        <Row align="center" justify="between">
                            <Text caption bold>
                                {t('words.total')}
                            </Text>
                            <Text caption bold>
                                {formattedTotalAmount}
                            </Text>
                        </Row>
                    </Column>
                    <Divider />
                    <Column style={style.itemGroup}>
                        <NotesInput notes={notes} setNotes={setNotes} />
                    </Column>
                </Column>
            </Column>
            <Button
                title={t('words.send')}
                onPress={onSend}
                disabled={isProcessing}
                fullWidth
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
        content: {
            paddingHorizontal: theme.spacing.xl,
        },
        item: {
            paddingVertical: theme.spacing.sm,
        },
        itemGroup: {
            paddingVertical: theme.spacing.md,
        },
        darkGrey: {
            color: theme.colors.darkGrey,
        },
        sendFrom: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        amountContainer: {
            paddingVertical: theme.spacing.xl,
        },
    })

export default ConfirmSendChatPayment
