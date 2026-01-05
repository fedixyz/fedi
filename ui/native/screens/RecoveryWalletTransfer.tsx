import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Column } from '../components/ui/Flex'
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
        <Column grow center gap="lg" style={style.container}>
            <Column align="center" gap="lg" style={style.centeredContainer}>
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
            </Column>
            <Text caption style={style.subText}>
                {t('feature.recovery.transfer-existing-wallet-guidance-2')}
            </Text>
            <Button
                fullWidth
                title={t('words.continue')}
                onPress={() => navigation.navigate('RecoveryDeviceSelection')}
            />
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
        },
        centeredContainer: {
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
