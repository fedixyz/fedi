import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Overlay, Text, Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import { Button } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { FeeItem, useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import {
    increaseStableBalance,
    selectFormattedDepositTime,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import { FeeBreakdown } from '../components/feature/send/FeeBreakdown'
import { CurrencyAvatar } from '../components/feature/stabilitypool/CurrencyAvatar'
import LineBreak from '../components/ui/LineBreak'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('StabilityConfirmDeposit')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityConfirmDeposit'
>

const StabilityConfirmDeposit: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { amount } = route.params
    const toast = useToast()
    const [processingDeposit, setProcessingDeposit] = useState<boolean>(false)
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const [showDetails, setShowDetails] = useState<boolean>(false)
    const depositTime = useAppSelector(s => selectFormattedDepositTime(s, t))
    const { makeFormattedAmountsFromSats } = useAmountFormatter()
    const { formattedFiat, formattedSats, formattedUsd } =
        makeFormattedAmountsFromSats(amount)
    const { feeBreakdownTitle, makeStabilityPoolFeeContent } =
        useFeeDisplayUtils(t)

    const handleSubmit = async () => {
        try {
            setProcessingDeposit(true)
            const amountToDeposit = amountUtils.satToMsat(amount)
            await dispatch(
                increaseStableBalance({
                    fedimint,
                    amount: amountToDeposit,
                }),
            ).unwrap()
            navigation.replace('StabilityDepositInitiated', {
                amount,
            })
        } catch (error) {
            setProcessingDeposit(false)
            log.error('increaseStableBalance error', error)
            toast.error(t, error)
        }
    }

    const style = styles(theme, insets)

    const renderDetails = () => {
        const feeContent = makeStabilityPoolFeeContent(amount)
        const { formattedTotalFee, feeItemsBreakdown } = feeContent

        return (
            <>
                <View
                    style={[
                        showDetails
                            ? style.detailsContainer
                            : style.collapsedContainer,
                    ]}>
                    <View style={[style.detailItem, style.bottomBorder]}>
                        <Text
                            caption
                            bold
                            style={[
                                style.darkGrey,
                                style.detailItemTitle,
                            ]}>{`${t(
                            'feature.stabilitypool.deposit-from',
                        )}`}</Text>
                        <Text caption style={style.darkGrey}>
                            {`${t('feature.stabilitypool.bitcoin-balance')}`}
                        </Text>
                    </View>
                    <View style={[style.detailItem, style.bottomBorder]}>
                        <Text
                            caption
                            bold
                            style={[
                                style.darkGrey,
                                style.detailItemTitle,
                            ]}>{`${t(
                            'feature.stabilitypool.bitcoin-amount',
                        )}`}</Text>
                        <Text
                            caption
                            style={style.darkGrey}>{`${formattedSats}`}</Text>
                    </View>
                    <View style={[style.detailItem, style.bottomBorder]}>
                        <Text
                            caption
                            bold
                            style={[
                                style.darkGrey,
                                style.detailItemTitle,
                            ]}>{`USD ${t('words.amount')}`}</Text>
                        <Text
                            caption
                            style={style.darkGrey}>{`${formattedUsd}`}</Text>
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
                        <Text caption style={style.darkGrey}>
                            {formattedTotalFee}
                        </Text>
                        <SvgImage
                            name="Info"
                            size={16}
                            color={theme.colors.grey}
                            containerStyle={style.feeIcon}
                        />
                    </Pressable>
                    <View style={[style.detailItem]}>
                        <Text
                            caption
                            bold
                            style={[
                                style.darkGrey,
                                style.detailItemTitle,
                            ]}>{`${t(
                            'feature.stabilitypool.deposit-time',
                        )}`}</Text>
                        <Text caption style={style.darkGrey}>
                            {depositTime}
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
                                color={theme.colors.green}
                            />
                        }
                        feeItems={feeItemsBreakdown.map(
                            ({ label, formattedAmount }: FeeItem) => ({
                                label: label,
                                value: formattedAmount,
                            }),
                        )}
                        onClose={() => setShowFeeBreakdown(false)}
                        guidanceText={
                            <Trans
                                t={t}
                                i18nKey="feature.fees.guidance-stable-balance"
                                components={{
                                    br: <LineBreak />,
                                }}
                            />
                        }
                    />
                </Overlay>
            </>
        )
    }

    return (
        <View style={style.container}>
            <View style={style.conversionIndicator}>
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.md}
                    color={theme.colors.orange}
                />
                <SvgImage name="ArrowRight" color={theme.colors.primaryLight} />
                <CurrencyAvatar />
            </View>
            <View style={style.amountText}>
                <Text h1 numberOfLines={1}>
                    {formattedFiat}
                </Text>
            </View>
            <View style={style.buttonsGroup}>
                {renderDetails()}
                <Button
                    fullWidth
                    containerStyle={[style.button]}
                    onPress={handleSubmit}
                    disabled={processingDeposit}
                    loading={processingDeposit}
                    title={
                        <Text medium caption style={style.buttonText}>
                            {t('words.deposit')}
                        </Text>
                    }
                />
            </View>
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
        amountText: {
            marginTop: 'auto',
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
        detailItemTitle: {
            marginRight: 'auto',
        },
        darkGrey: {
            color: theme.colors.darkGrey,
        },
        detailsButton: {
            backgroundColor: theme.colors.offWhite,
        },
        feeIcon: {
            marginLeft: theme.spacing.xxs,
        },
        overlayContainer: {
            width: '90%',
            maxWidth: 312,
            padding: theme.spacing.xl,
            borderRadius: theme.borders.defaultRadius,
            alignItems: 'center',
        },
    })

export default StabilityConfirmDeposit
