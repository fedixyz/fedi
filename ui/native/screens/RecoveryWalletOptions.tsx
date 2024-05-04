import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { hexToRgba } from '@fedi/common/utils/color'

import HoloCircle from '../components/ui/HoloCircle'
import { Pressable } from '../components/ui/Pressable'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoveryWalletOptions'
>

const RecoveryWalletOptions: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.headerContainer}>
                <HoloCircle content={<Text>{'🔒'}</Text>} size={64} />
                <Text h2 medium>
                    {t('feature.recovery.choose-wallet-option')}
                </Text>
            </View>
            <View style={style.optionsContainer}>
                <Pressable
                    containerStyle={style.actionCardContainer}
                    onPress={() =>
                        navigation.navigate('RecoveryWalletTransfer')
                    }>
                    <View style={style.roundIconContainer}>
                        <SvgImage
                            name="ArrowLoopRight"
                            size={SvgImageSize.sm}
                        />
                    </View>
                    <View style={style.actionCardTextContainer}>
                        <Text medium>
                            {t('feature.recovery.transfer-existing-wallet')}
                        </Text>
                        <Text small style={{ color: theme.colors.darkGrey }}>
                            {t('feature.recovery.from-different-device')}
                        </Text>
                    </View>
                    <View style={style.arrowContainer}>
                        <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                    </View>
                </Pressable>
                <Pressable
                    containerStyle={style.actionCardContainer}
                    // onPress={() => navigation.navigate('RecoveryNewWallet')}
                    // TODO: reenable once we've figured out a clear
                    // way to communicate this
                    disabled>
                    <View style={style.roundIconContainer}>
                        <SvgImage name="Wallet" size={SvgImageSize.sm} />
                    </View>
                    <View style={style.actionCardTextContainer}>
                        <Text medium>
                            {t('feature.recovery.create-new-wallet')}
                        </Text>
                        <Text small style={{ color: theme.colors.darkGrey }}>
                            {t('feature.recovery.fresh-wallet')}
                        </Text>
                    </View>
                    <View style={style.arrowContainer}>
                        <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                    </View>
                </Pressable>
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            marginTop: theme.spacing.xxl,
            padding: theme.spacing.lg,
            gap: 24,
        },
        headerContainer: {
            alignItems: 'center',
            gap: 16,
        },
        optionsContainer: { alignItems: 'center', width: '100%', gap: 16 },
        actionCardContainer: {
            padding: theme.spacing.md,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.offWhite,
            borderRadius: 16,
            gap: 10,
        },
        roundIconContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.secondary,
            height: 40,
            width: 40,
            borderRadius: 20,
            shadowOpacity: 1,
            shadowColor: hexToRgba(theme.colors.night, 0.1),
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
        },
        actionCardTextContainer: { alignItems: 'flex-start', gap: 2 },
        arrowContainer: { marginLeft: 'auto' },
    })

export default RecoveryWalletOptions
