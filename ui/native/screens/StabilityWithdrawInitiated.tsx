import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'

import { CurrencyAvatar } from '../components/feature/stabilitypool/CurrencyAvatar'
import HoloCircle from '../components/ui/HoloCircle'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityWithdrawInitiated'
>

const StabilityWithdrawInitiated: React.FC<Props> = ({ route, navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const { amount } = route.params
    const { convertSatsToFormattedFiat } = useBtcFiatPrice()
    const formattedFiat = convertSatsToFormattedFiat(amount)

    const style = styles(theme, insets)

    return (
        <View style={style.container}>
            <View style={style.conversionIndicator}>
                <CurrencyAvatar />
                <SvgImage name="ArrowRight" color={theme.colors.primaryLight} />
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.md}
                    color={theme.colors.orange}
                />
            </View>
            <View style={style.holoCircleContainer}>
                <HoloCircle
                    content={
                        <View style={style.holoContentContainer}>
                            <SvgImage name="Check" size={SvgImageSize.md} />
                            <Text medium style={[style.holoText]}>{`${t(
                                'feature.stabilitypool.will-be-withdrawn',
                                {
                                    amount: formattedFiat,
                                    // Get deposit time from client config?
                                    expectedWait: '10 min or less',
                                },
                            )}`}</Text>
                            <Text
                                caption
                                medium
                                style={[style.holoText, style.darkGrey]}>
                                {t('feature.stabilitypool.amount-may-vary')}
                            </Text>
                        </View>
                    }
                />
            </View>
            <Button
                fullWidth
                containerStyle={style.button}
                onPress={() => navigation.navigate('StabilityHome')}
                title={
                    <Text medium caption style={style.buttonText}>
                        {t('words.okay')}
                    </Text>
                }
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
        conversionIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        currencyAvatar: {
            backgroundColor: theme.colors.green,
        },
        currencyAvatarTitle: {
            ...theme.styles.avatarText,
        },
        holoCircleContainer: {
            marginTop: 'auto',
        },
        holoContentContainer: {
            textAlign: 'center',
            alignItems: 'center',
        },
        holoText: {
            textAlign: 'center',
            paddingVertical: theme.spacing.xs,
            maxWidth: 200,
        },
        darkGrey: {
            color: theme.colors.darkGrey,
        },
        button: {
            marginTop: 'auto',
        },
        buttonText: {
            color: theme.colors.secondary,
        },
    })

export default StabilityWithdrawInitiated
