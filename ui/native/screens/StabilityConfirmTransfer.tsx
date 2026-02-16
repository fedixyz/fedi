import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import {
    selectLoadedFederation,
    selectMatrixContactById,
    transferStableBalance,
    transferStableBalanceMatrix,
} from '@fedi/common/redux'
import { SupportedCurrency } from '@fedi/common/types'
import stringUtils from '@fedi/common/utils/StringUtils'
import { makeLog } from '@fedi/common/utils/log'

import ChatAvatar from '../components/feature/chat/ChatAvatar'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendAmounts from '../components/feature/send/SendAmounts'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import StabilityWalletTitle from '../components/feature/stabilitypool/StabilityWalletTitle'
import { AvatarSize } from '../components/ui/Avatar'
import { Column, Row } from '../components/ui/Flex'
import NotesInput from '../components/ui/NotesInput'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetAfterSendSuccess } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('StabilityConfirmTransfer')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityConfirmTransfer'
>

const StabilityConfirmTransfer: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const {
        amount,
        federationId,
        recipient,
        notes: initialNotes,
    } = route.params
    // TODO: Figure out a good way to maintain continuity of notes across both
    // screens. Currently, if you update the notes here then hit back, the "updated"
    // notes will not be persisted.
    const [notes, setNotes] = useState<string>(initialNotes ?? '')
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const recipientContact = useAppSelector(s =>
        'matrixUserId' in recipient
            ? selectMatrixContactById(s, recipient.matrixUserId)
            : null,
    )
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const { feeBreakdownTitle, makeSPTransferFeeContent } = useFeeDisplayUtils(
        t,
        federationId,
    )
    const { formattedTotalFee, feeItemsBreakdown } = makeSPTransferFeeContent()
    const toast = useToast()
    const [processingTransfer, setProcessingTransfer] = useState<boolean>(false)
    const { convertCentsToFormattedFiat } = useBtcFiatPrice(
        undefined,
        federationId,
    )

    const formattedFiat = convertCentsToFormattedFiat(amount, 'none')
    const formattedFiatCode = convertCentsToFormattedFiat(amount, 'end')

    const handleSubmit = async () => {
        try {
            setProcessingTransfer(true)
            if ('matrixUserId' in recipient) {
                await dispatch(
                    transferStableBalanceMatrix({
                        fedimint,
                        amount,
                        recipientMatrixId: recipient.matrixUserId,
                        federationId,
                    }),
                )
                // TODO: Kick them to the chat screens for confirmation/etc.
                // This just shows the confirmation screen always.
                setProcessingTransfer(false)
                navigation.dispatch(
                    resetAfterSendSuccess({
                        title: t('feature.send.transferred'),
                        description: t('feature.send.transferred-description'),
                        formattedAmount: formattedFiat,
                        federationId,
                    }),
                )
            } else {
                await dispatch(
                    transferStableBalance({
                        fedimint,
                        amount,
                        accountId: recipient.accountId,
                        federationId,
                    }),
                )
                setProcessingTransfer(false)
                navigation.dispatch(
                    resetAfterSendSuccess({
                        title: t('feature.send.transferred'),
                        description: t('feature.send.transferred-description'),
                        formattedAmount: formattedFiat,
                        federationId,
                    }),
                )
            }
        } catch (error) {
            setProcessingTransfer(false)
            log.error('decreaseStableBalance error', error)
            toast.error(t, error)
        }
    }

    const style = styles(theme)

    return (
        <SafeAreaView
            style={style.container}
            edges={{ left: 'additive', right: 'additive', bottom: 'maximum' }}>
            {federation ? (
                <View style={style.conversionIndicator}>
                    <SvgImage
                        name="UsdCircleFilled"
                        size={SvgImageSize.sm}
                        color={theme.colors.mint}
                    />
                    <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                    <SvgImage
                        name="UsdCircleFilled"
                        size={SvgImageSize.sm}
                        color={theme.colors.mint}
                    />
                </View>
            ) : (
                <ActivityIndicator />
            )}
            <Column align="center" style={style.amountContainer}>
                <SendAmounts
                    showBalance={false}
                    formattedPrimaryAmount={
                        <Row justify="start" align="end" gap="sm">
                            <Text h1 medium numberOfLines={1}>
                                {formattedFiat}
                            </Text>
                            <Text
                                numberOfLines={1}
                                medium
                                style={style.currencyCode}>
                                {SupportedCurrency.USD}
                            </Text>
                        </Row>
                    }
                />
                <NotesInput
                    label={t('words.edit')}
                    notes={notes}
                    setNotes={setNotes}
                />
            </Column>
            <SendPreviewDetails
                onPressFees={() => setShowFeeBreakdown(true)}
                formattedTotalFee={formattedTotalFee}
                onSend={handleSubmit}
                isLoading={processingTransfer}
                sendButtonText={t('words.transfer')}
                senderText={
                    <StabilityWalletTitle
                        small
                        bold
                        federationId={federationId}
                    />
                }
                receiverText={
                    recipientContact ? (
                        <View style={style.sendFrom}>
                            <ChatAvatar
                                user={recipientContact}
                                size={AvatarSize.xs}
                            />
                            <Text caption color={theme.colors.primary} medium>
                                {recipientContact.displayName}
                            </Text>
                        </View>
                    ) : 'address' in recipient ? (
                        <View style={style.sendFrom}>
                            <Text caption color={theme.colors.primary} medium>
                                {stringUtils.truncateMiddleOfString(
                                    recipient.address,
                                    8,
                                )}
                            </Text>
                        </View>
                    ) : null
                }
                formattedTotalAmount={formattedFiatCode}
                formattedAmount={formattedFiatCode}
                showTotalFee={true}
            />
            <FeeOverlay
                show={showFeeBreakdown}
                onDismiss={() => setShowFeeBreakdown(false)}
                title={feeBreakdownTitle}
                feeItems={feeItemsBreakdown}
            />
        </SafeAreaView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            padding: theme.spacing.lg,
        },
        amountContainer: {
            // The buttons in the SendPreviewDetails also have a marginTop
            // so this centers the amounts
            marginTop: 'auto',
            gap: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
        },
        buttonsGroup: {
            width: '100%',
            marginTop: 'auto',
            flexDirection: 'column',
        },
        button: {
            marginTop: theme.spacing.lg,
        },
        buttonText: {
            color: theme.colors.secondary,
        },
        conversionIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        collapsedContainer: {
            height: 0,
            opacity: 0,
        },
        detailsContainer: {
            width: '100%',
            opacity: 1,
            flexDirection: 'column',
        },
        detailItem: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 52,
        },
        detailsButton: {
            backgroundColor: theme.colors.offWhite,
        },
        sendFrom: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        currencyCode: {
            paddingBottom: theme.spacing.xs,
        },
    })

export default StabilityConfirmTransfer
