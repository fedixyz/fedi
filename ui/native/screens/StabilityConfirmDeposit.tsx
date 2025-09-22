import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import {
    increaseStableBalance,
    selectFormattedDepositTime,
    selectStabilityPoolAverageFeeRate,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import FeeOverlay from '../components/feature/send/FeeOverlay'
import SendAmounts from '../components/feature/send/SendAmounts'
import { Row, Column } from '../components/ui/Flex'
import LineBreak from '../components/ui/LineBreak'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetAfterSendSuccess } from '../state/navigation'
import { SupportedCurrency } from '../types'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('StabilityConfirmDeposit')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityConfirmDeposit'
>

const StabilityConfirmDeposit: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { amount, federationId = '' } = route.params
    const toast = useToast()
    const [processingDeposit, setProcessingDeposit] = useState<boolean>(false)
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const [showDetails, setShowDetails] = useState<boolean>(false)
    const depositTime = useAppSelector(s =>
        selectFormattedDepositTime(s, federationId, t),
    )
    const { makeFormattedAmountsFromSats } = useAmountFormatter({
        federationId,
    })
    const { formattedSats, formattedUsd } = makeFormattedAmountsFromSats(
        amount,
        'end',
    )
    const { formattedUsd: formattedUsdWithoutSymbol } =
        makeFormattedAmountsFromSats(amount, 'none')

    const { feeBreakdownTitle, makeSPDepositFeeContent } = useFeeDisplayUtils(
        t,
        federationId,
    )
    const stabilityPoolAverageFeeRate = useAppSelector(s =>
        selectStabilityPoolAverageFeeRate(s, federationId),
    )

    const handleSubmit = async () => {
        try {
            setProcessingDeposit(true)
            const amountToDeposit = amountUtils.satToMsat(amount)
            await dispatch(
                increaseStableBalance({
                    fedimint,
                    amount: amountToDeposit,
                    federationId,
                }),
            ).unwrap()

            navigation.dispatch(
                resetAfterSendSuccess({
                    title: t('feature.stabilitypool.deposited'),
                    description: t(
                        'feature.stabilitypool.deposit-success-description',
                    ),
                    formattedAmount: formattedUsd,
                    // TODO: make sure we either autoscroll or change the last used federation ID
                    // so users with many wallets aren't confused
                    // federationId,
                }),
            )
        } catch (error) {
            setProcessingDeposit(false)
            log.error('increaseStableBalance error', error)
            toast.error(t, error)
        }
    }

    const style = styles(theme)

    // TODO: refactor this to use the shared SendPreviewDetails component
    const renderDetails = () => {
        const feeContent = makeSPDepositFeeContent(amount)
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
                            color={theme.colors.primary}
                            style={style.detailItemTitle}>
                            {t('feature.stabilitypool.deposit-from')}
                        </Text>
                        <Text caption medium color={theme.colors.primary}>
                            {t('feature.stabilitypool.bitcoin-balance')}
                        </Text>
                    </View>
                    <View style={[style.detailItem, style.bottomBorder]}>
                        <Text caption bold style={style.detailItemTitle}>
                            {t('feature.stabilitypool.bitcoin-amount')}
                        </Text>
                        <Text caption medium color={theme.colors.primary}>
                            {formattedSats}
                        </Text>
                    </View>
                    <View style={[style.detailItem, style.bottomBorder]}>
                        <Text caption bold style={style.detailItemTitle}>
                            {t('feature.stabilitypool.usd-amount')}
                        </Text>
                        <Text caption medium color={theme.colors.primary}>
                            {formattedUsd}
                        </Text>
                    </View>
                    <Pressable
                        style={[style.detailItem, style.bottomBorder]}
                        onPress={() => setShowFeeBreakdown(true)}>
                        <Text caption bold style={style.detailItemTitle}>
                            {t('words.fees')}
                        </Text>
                        <Text caption medium color={theme.colors.primary}>
                            {formattedTotalFee}
                        </Text>
                        <SvgImage
                            name="Info"
                            size={16}
                            color={theme.colors.primary}
                            containerStyle={style.feeIcon}
                        />
                    </Pressable>
                    <View style={style.detailItem}>
                        <Text caption bold style={style.detailItemTitle}>
                            {t('feature.stabilitypool.deposit-time')}
                        </Text>
                        <Text caption medium color={theme.colors.primary}>
                            {depositTime}
                        </Text>
                    </View>
                </View>
                <Button
                    fullWidth
                    containerStyle={style.button}
                    buttonStyle={style.detailsButton}
                    onPress={() => setShowDetails(!showDetails)}
                    title={
                        <Text medium caption>
                            {showDetails
                                ? t('phrases.hide-details')
                                : t('feature.stabilitypool.details-and-fee')}
                        </Text>
                    }
                />

                <FeeOverlay
                    show={showFeeBreakdown}
                    onDismiss={() => setShowFeeBreakdown(false)}
                    title={feeBreakdownTitle}
                    feeItems={feeItemsBreakdown}
                    description={
                        stabilityPoolAverageFeeRate ? (
                            <Trans
                                t={t}
                                i18nKey="feature.fees.guidance-stable-balance"
                                components={{
                                    br: <LineBreak />,
                                }}
                            />
                        ) : null
                    }
                    icon={
                        <SvgImage
                            name="Info"
                            size={32}
                            color={theme.colors.green}
                        />
                    }
                />
            </>
        )
    }

    return (
        <SafeAreaView
            style={style.container}
            edges={{ left: 'additive', right: 'additive', bottom: 'maximum' }}>
            <View style={style.conversionIndicator}>
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.sm}
                    color={theme.colors.orange}
                />
                <SvgImage name="ArrowRight" color={theme.colors.primaryLight} />
                <SvgImage
                    name="UsdCircleFilled"
                    size={SvgImageSize.sm}
                    color={theme.colors.mint}
                />
            </View>
            <SendAmounts
                showBalance={false}
                formattedPrimaryAmount={
                    <Row justify="start" align="end" gap="sm">
                        <Text h1 medium numberOfLines={1}>
                            {formattedUsdWithoutSymbol}
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
            <Column fullWidth style={style.buttonsGroup}>
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
            </Column>
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
        amountText: {
            marginTop: 'auto',
        },
        bottomBorder: {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
        },
        buttonsGroup: {
            marginTop: 'auto',
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
        black: {
            color: theme.colors.night,
        },
        detailsButton: {
            backgroundColor: theme.colors.grey100,
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
        currencyCode: {
            paddingBottom: theme.spacing.xs,
        },
    })

export default StabilityConfirmDeposit
