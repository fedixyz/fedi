import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CurrencyAvatar } from '../components/feature/stabilitypool/CurrencyAvatar'
import { Row } from '../components/ui/Flex'
import HoloCircle from '../components/ui/HoloCircle'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { resetToWallets } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityWithdrawInitiated'
>

const StabilityWithdrawInitiated: React.FC<Props> = ({ route, navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { formattedFiat } = route.params

    const style = styles(theme)

    return (
        <SafeAreaView
            style={style.container}
            edges={{ left: 'additive', right: 'additive', bottom: 'maximum' }}>
            <Row align="center" gap="sm">
                <CurrencyAvatar />
                <SvgImage name="ArrowRight" color={theme.colors.primaryLight} />
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.md}
                    color={theme.colors.orange}
                />
            </Row>
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
                onPress={() => navigation.dispatch(resetToWallets())}
                title={
                    <Text medium caption style={style.buttonText}>
                        {t('words.okay')}
                    </Text>
                }
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
