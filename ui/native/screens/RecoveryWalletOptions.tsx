import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { hexToRgba } from '@fedi/common/utils/color'

import { Column } from '../components/ui/Flex'
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
            <Column align="center" gap="lg">
                <HoloCircle content={<Text>{'🔒'}</Text>} size={64} />
                <Text h2 medium>
                    {t('feature.recovery.choose-wallet-option')}
                </Text>
            </Column>
            <Column align="center" gap="lg" fullWidth>
                <Pressable
                    containerStyle={style.actionCardContainer}
                    onPress={() =>
                        navigation.navigate('RecoveryWalletTransfer')
                    }>
                    <Column center style={style.roundIconContainer}>
                        <SvgImage
                            name="ArrowLoopRight"
                            size={SvgImageSize.sm}
                        />
                    </Column>
                    <Column align="start" gap="xxs">
                        <Text medium>
                            {t('feature.recovery.transfer-existing-wallet')}
                        </Text>
                        <Text small style={{ color: theme.colors.darkGrey }}>
                            {t('feature.recovery.from-different-device')}
                        </Text>
                    </Column>
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
                    <Column center style={style.roundIconContainer}>
                        <SvgImage name="Wallet" size={SvgImageSize.sm} />
                    </Column>
                    <Column align="start" gap="xxs">
                        <Text medium>
                            {t('feature.recovery.create-new-wallet')}
                        </Text>
                        <Text small style={{ color: theme.colors.darkGrey }}>
                            {t('feature.recovery.fresh-wallet')}
                        </Text>
                    </Column>
                    <View style={style.arrowContainer}>
                        <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                    </View>
                </Pressable>
            </Column>
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
        arrowContainer: { marginLeft: 'auto' },
    })

export default RecoveryWalletOptions
