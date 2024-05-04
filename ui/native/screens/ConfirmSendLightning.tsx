import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Overlay, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import { FeeItem, useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { selectActiveFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { hexToRgba } from '@fedi/common/utils/color'

import { fedimint } from '../bridge'
import { FeeBreakdown } from '../components/feature/send/FeeBreakdown'
import { AmountScreen } from '../components/ui/AmountScreen'
import LineBreak from '../components/ui/LineBreak'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmSendLightning'
>

const ConfirmSendLightning: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const { feeBreakdownTitle, makeLightningFeeContent } = useFeeDisplayUtils(t)
    const { parsedData } = route.params
    const {
        isReadyToPay,
        exactAmount,
        minimumAmount,
        maximumAmount,
        inputAmount,
        description,
        feeDetails,
        sendTo,
        setInputAmount,
        handleOmniInput,
        handleOmniSend,
    } = useOmniPaymentState(fedimint, activeFederation?.id)

    useEffect(() => {
        handleOmniInput(parsedData)
    }, [handleOmniInput, parsedData])

    const [unit] = useState('sats')
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const [showDetails, setShowDetails] = useState<boolean>(false)

    const [isPayingInvoice, setIsPayingInvoice] = useState<boolean>(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const navigationReplace = navigation.replace
    const handleSend = useCallback(async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (inputAmount > maximumAmount || inputAmount < minimumAmount) return

        setIsPayingInvoice(true)
        try {
            await handleOmniSend(inputAmount)
            navigationReplace('SendSuccess', {
                amount: amountUtils.satToMsat(inputAmount),
                unit,
            })
        } catch (err) {
            toast.error(t, err)
        }
        setIsPayingInvoice(false)
    }, [
        handleOmniSend,
        inputAmount,
        minimumAmount,
        maximumAmount,
        unit,
        navigationReplace,
        toast,
        t,
    ])

    if (!isReadyToPay) return <ActivityIndicator />

    const style = styles(theme, insets)

    const renderDetails = () => {
        if (!feeDetails) return null

        const feeContent = makeLightningFeeContent(feeDetails)
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
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'feature.send.send-to',
                        )}`}</Text>
                        <Text caption style={style.darkGrey}>
                            {sendTo}
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
                            containerStyle={style.feeIcon}
                        />
                    </Pressable>
                    <View style={[style.detailItem]}>
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'feature.send.send-from',
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
                                color={theme.colors.orange}
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
                                i18nKey="feature.fees.guidance-lightning"
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
        <AmountScreen
            showBalance
            amount={inputAmount}
            onChangeAmount={setInputAmount}
            minimumAmount={minimumAmount}
            maximumAmount={maximumAmount}
            submitAttempts={submitAttempts}
            isSubmitting={isPayingInvoice}
            readOnly={!!exactAmount}
            description={description}
            subContent={renderDetails()}
            buttons={[
                {
                    title: `${t('words.send')}${
                        inputAmount
                            ? ` ${amountUtils.formatNumber(inputAmount)} `
                            : ' '
                    }${t('words.sats').toUpperCase()}`,
                    onPress: handleSend,
                    loading: isPayingInvoice,
                    disabled: isPayingInvoice,
                },
            ]}
        />
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

export default ConfirmSendLightning
