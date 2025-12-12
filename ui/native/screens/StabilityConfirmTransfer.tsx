import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { transferStableBalance } from '@fedi/common/redux'
import stringUtils from '@fedi/common/utils/StringUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendAmounts from '../components/feature/send/SendAmounts'
import SendPreviewDetails from '../components/feature/send/SendPreviewDetails'
import StabilityBalanceTile from '../components/feature/stabilitypool/StabilityBalanceTile'
import StabilityWalletTitle from '../components/feature/stabilitypool/StabilityWalletTitle'
import { Column } from '../components/ui/Flex'
import { useAppDispatch } from '../state/hooks'
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
    const { amount, federationId, recipient } = route.params
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

    const formattedFiat = convertCentsToFormattedFiat(amount, 'end')

    const handleSubmit = async () => {
        try {
            setProcessingTransfer(true)
            if ('accountId' in recipient) {
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
            <StabilityBalanceTile federationId={federationId} />
            <Column align="center" style={style.amountContainer}>
                <StabilityWalletTitle bolder federationId={federationId} />
                <SendAmounts
                    showBalance={false}
                    formattedPrimaryAmount={formattedFiat}
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
                    'address' in recipient ? (
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
            padding: theme.spacing.lg,
        },
        amountContainer: {
            // The buttons in the SendPreviewDetails also have a marginTop
            // so this centers the amounts
            marginTop: 'auto',
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
