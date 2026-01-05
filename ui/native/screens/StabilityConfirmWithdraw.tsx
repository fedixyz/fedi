import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Divider, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    decreaseStableBalanceV1,
    decreaseStableBalanceV2,
    selectFormattedDepositTime,
    selectStabilityPoolVersion,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { CurrencyAvatar } from '../components/feature/stabilitypool/CurrencyAvatar'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('StabilityConfirmWithdraw')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityConfirmWithdraw'
>

const StabilityConfirmWithdraw: React.FC<Props> = ({ route, navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { amountSats, amountCents, federationId = '' } = route.params
    const toast = useToast()
    const [processingDeposit, setProcessingDeposit] = useState<boolean>(false)
    const [showDetails, setShowDetails] = useState<boolean>(false)
    const { convertSatsToFormattedFiat, convertCentsToFormattedFiat } =
        useBtcFiatPrice()
    const version = useAppSelector(s =>
        selectStabilityPoolVersion(s, federationId),
    )

    const formattedFiat =
        version === 2
            ? convertCentsToFormattedFiat(amountCents)
            : convertSatsToFormattedFiat(amountSats)

    const depositTime = useAppSelector(s =>
        selectFormattedDepositTime(s, federationId, t),
    )

    const handleSubmit = async () => {
        try {
            setProcessingDeposit(true)
            if (version === 2) {
                await dispatch(
                    decreaseStableBalanceV2({
                        fedimint,
                        amount: amountCents,
                        federationId,
                    }),
                ).unwrap()
            } else {
                const amountMsats = amountUtils.satToMsat(amountSats)
                await dispatch(
                    decreaseStableBalanceV1({
                        fedimint,
                        amount: amountMsats,
                        federationId,
                    }),
                ).unwrap()
            }
            navigation.replace('StabilityWithdrawInitiated', {
                formattedFiat,
                federationId,
            })
        } catch (error) {
            setProcessingDeposit(false)
            log.error('decreaseStableBalance error', error)
            toast.error(t, error)
        }
    }

    const style = styles(theme)

    return (
        <SafeAreaView
            style={style.container}
            edges={{ left: 'additive', right: 'additive', bottom: 'maximum' }}>
            <View style={style.conversionIndicator}>
                <CurrencyAvatar />
                <SvgImage name="ArrowRight" color={theme.colors.primaryLight} />
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.md}
                    color={theme.colors.orange}
                />
            </View>
            <View style={style.amountText}>
                <Text h1 numberOfLines={1}>
                    {formattedFiat}
                </Text>
                <Text medium style={[style.darkGrey]}>
                    {t('feature.stabilitypool.amount-may-vary-during-withdraw')}
                </Text>
            </View>
            <View style={style.buttonsGroup}>
                <View
                    style={[
                        showDetails
                            ? style.detailsContainer
                            : style.collapsedContainer,
                    ]}>
                    <View style={style.detailItem}>
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'feature.stabilitypool.withdraw-to',
                        )}`}</Text>
                        <Text caption style={style.darkGrey}>
                            {`${t('feature.stabilitypool.bitcoin-balance')}`}
                        </Text>
                    </View>
                    <Divider />
                    <View style={style.detailItem}>
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'words.fees',
                        )}`}</Text>

                        <Text caption style={style.darkGrey}>
                            {`0%`}
                        </Text>
                    </View>
                    <Divider />
                    <View style={style.detailItem}>
                        <Text caption bold style={style.darkGrey}>{`${t(
                            'feature.stabilitypool.withdrawal-time',
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
                                : t('words.details')}
                        </Text>
                    }
                />
                <Button
                    fullWidth
                    containerStyle={[style.button]}
                    onPress={handleSubmit}
                    disabled={processingDeposit}
                    loading={processingDeposit}
                    title={
                        <Text medium caption style={style.buttonText}>
                            {t('words.withdraw')}
                        </Text>
                    }
                />
            </View>
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
            alignItems: 'center',
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
        darkGrey: {
            color: theme.colors.darkGrey,
        },
        detailsButton: {
            backgroundColor: theme.colors.offWhite,
        },
    })

export default StabilityConfirmWithdraw
