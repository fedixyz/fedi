import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import HoloCircle from '../components/ui/HoloCircle'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoveryWalletTransfer'
>

const RecoveryWalletTransfer: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.centeredContainer}>
                <HoloCircle
                    content={
                        <SvgImage
                            name="ArrowLoopRight"
                            size={SvgImageSize.md}
                        />
                    }
                    size={64}
                />

                <Text h2 medium h2Style={style.centeredText}>
                    {t('feature.recovery.transfer-existing-wallet')}
                </Text>
                <Text medium style={style.centeredText}>
                    {t('feature.recovery.transfer-existing-wallet-guidance-1')}
                </Text>
            </View>
            <Text caption style={style.subText}>
                {t('feature.recovery.transfer-existing-wallet-guidance-2')}
            </Text>
            <Button
                fullWidth
                title={t('words.continue')}
                onPress={() => navigation.navigate('RecoveryDeviceSelection')}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: theme.spacing.lg,
        },
        centeredContainer: {
            alignItems: 'center',
            gap: 16,
            marginTop: 'auto',
            paddingHorizontal: theme.spacing.lg,
        },
        centeredText: {
            textAlign: 'center',
        },
        subText: {
            marginTop: 'auto',
            marginBottom: theme.spacing.md,
            color: theme.colors.darkGrey,
        },
    })

export default RecoveryWalletTransfer
