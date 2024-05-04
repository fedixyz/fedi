import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Overlay, Text, Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import { Button } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Keyboard, Pressable, StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    useBalanceDisplay,
    useAmountFormatter,
} from '@fedi/common/hooks/amount'
import { FeeItem, useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { hexToRgba } from '@fedi/common/utils/color'
import { makeLog } from '@fedi/common/utils/log'

import { FeeBreakdown } from '../components/feature/send/FeeBreakdown'
import SvgImage from '../components/ui/SvgImage'
import { useBridge } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ConfirmSendEcash')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmSendEcash'
>

const ConfirmSendEcash: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const { t } = useTranslation()
    const { amount } = route.params
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const [showDetails, setShowDetails] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const { generateEcash } = useBridge()
    const balanceDisplay = useBalanceDisplay(t)
    const { feeBreakdownTitle, ecashFeesGuidanceText, makeEcashFeeContent } =
        useFeeDisplayUtils(t)
    const { formattedTotalFee, feeItemsBreakdown } = makeEcashFeeContent(
        amountUtils.satToMsat(amount),
    )
    const { makeFormattedAmountsFromSats } = useAmountFormatter()
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromSats(amount)

    const onGenerateEcash = async () => {
        setIsLoading(true)
        try {
            const millis = amountUtils.satToMsat(Number(amount) as Sats)
            const { ecash } = await generateEcash(millis)
            navigation.navigate('SendOfflineQr', { ecash, amount: millis })
        } catch (error) {
            log.error('onGenerateEcash', error)
        }
        setIsLoading(false)
    }

    const continueSend = () => {
        Keyboard.dismiss()
        onGenerateEcash()
    }

    const onConfirm = () => {
        Alert.alert(
            t('phrases.please-confirm'),
            t('feature.send.offline-send-warning'),
            [
                {
                    text: t('phrases.go-back'),
                },
                {
                    text: t('words.continue'),
                    onPress: continueSend,
                },
            ],
        )
    }

    const style = styles(theme, insets)

    return (
        <View style={style.container}>
            <Text
                caption
                style={style.balance}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {`${balanceDisplay} `}
            </Text>
            <View style={style.amountContainer}>
                <Text h1 numberOfLines={1}>
                    {formattedPrimaryAmount}
                </Text>
                <Text
                    style={style.secondaryAmountText}
                    medium
                    numberOfLines={1}>
                    {formattedSecondaryAmount}
                </Text>
            </View>
            <View style={style.buttonsGroup}>
                <View
                    style={[
                        showDetails
                            ? style.detailsContainer
                            : style.collapsedContainer,
                    ]}>
                    <View style={[style.detailItem, style.bottomBorder]}>
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'feature.send.send-to',
                        )}`}</Text>
                        <Text caption style={style.darkGrey}>
                            {`username`}
                        </Text>
                    </View>
                    <Pressable
                        style={[style.detailItem, style.bottomBorder]}
                        onPress={() => setShowFeeBreakdown(true)}>
                        <Text
                            caption
                            bold
                            style={[
                                style.darkGrey,
                                style.detailItemTitle,
                            ]}>{`${t('words.fees')}`}</Text>
                        <Text
                            caption
                            style={
                                style.darkGrey
                            }>{`${formattedTotalFee}`}</Text>
                        <SvgImage
                            name="Info"
                            size={16}
                            color={theme.colors.grey}
                        />
                    </Pressable>
                    <View style={[style.detailItem]}>
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'feature.send.send-to',
                        )}`}</Text>

                        <Text caption style={style.darkGrey}>
                            {`${t('feature.stabilitypool.bitcoin-balance')}`}
                        </Text>
                    </View>
                </View>
                <Button
                    fullWidth
                    containerStyle={[style.button]}
                    buttonStyle={[style.detailsButton]}
                    onPress={() => setShowDetails(!showDetails)}
                    title={
                        <Text medium caption>
                            {showDetails
                                ? t('phrases.hide-details')
                                : t('feature.stabilitypool.details-and-fee')}
                        </Text>
                    }
                />
                <Button
                    fullWidth
                    containerStyle={[style.button]}
                    onPress={onConfirm}
                    disabled={isLoading}
                    loading={isLoading}
                    title={
                        <Text medium caption style={style.buttonText}>
                            {t('words.send')}
                        </Text>
                    }
                />
            </View>

            <Overlay
                isVisible={showFeeBreakdown}
                overlayStyle={style.overlayContainer}
                onBackdropPress={() => setShowFeeBreakdown(false)}>
                <FeeBreakdown
                    title={feeBreakdownTitle}
                    icon={
                        <SvgImage
                            name="Info"
                            size={32}
                            color={theme.colors.blue}
                        />
                    }
                    feeItems={feeItemsBreakdown.map(
                        ({ label, formattedAmount }: FeeItem) => ({
                            label: label,
                            value: formattedAmount,
                        }),
                    )}
                    onClose={() => setShowFeeBreakdown(false)}
                    guidanceText={ecashFeesGuidanceText}
                />
            </Overlay>
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
        amountContainer: {
            marginTop: 'auto',
        },
        balance: {
            color: hexToRgba(theme.colors.primary, 0.6),
            textAlign: 'center',
        },
        bottomBorder: {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
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
        detailItemTitle: {
            marginRight: 'auto',
        },
        darkGrey: {
            color: theme.colors.darkGrey,
        },
        detailsButton: {
            backgroundColor: theme.colors.offWhite,
        },
        overlayContainer: {
            width: '90%',
            maxWidth: 312,
            padding: theme.spacing.xl,
            borderRadius: theme.borders.defaultRadius,
            alignItems: 'center',
        },
        secondaryAmountText: {
            color: theme.colors.darkGrey,
            textAlign: 'center',
            marginRight: theme.spacing.xs,
            marginTop: theme.spacing.xs,
        },
    })

export default ConfirmSendEcash
