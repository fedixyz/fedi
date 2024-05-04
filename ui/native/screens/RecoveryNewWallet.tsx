import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useDeviceRegistration } from '@fedi/common/hooks/recovery'

import { fedimint } from '../bridge'
import HoloCircle from '../components/ui/HoloCircle'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoveryNewWallet'
>

const RecoveryNewWallet: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { handleNewWallet } = useDeviceRegistration(t, fedimint)

    const style = styles(theme)

    const handleContinue = () => {
        handleNewWallet(hasSetDisplayName => {
            if (hasSetDisplayName) {
                navigation.navigate('TabsNavigator')
            } else {
                navigation.navigate('EnterDisplayName')
            }
        })
    }

    return (
        <View style={style.container}>
            <View style={style.centeredContainer}>
                <HoloCircle
                    content={<SvgImage name="Wallet" size={SvgImageSize.md} />}
                    size={64}
                />

                <Text h2 medium h2Style={style.centeredText}>
                    {t('feature.recovery.create-a-new-wallet')}
                </Text>
                <Text medium style={style.centeredText}>
                    {t('feature.recovery.create-new-wallet-guidance')}
                </Text>
            </View>
            <Text caption style={style.subText}>
                {t('words.enjoy')}
            </Text>
            <Button
                fullWidth
                title={t('words.continue')}
                onPress={handleContinue}
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

export default RecoveryNewWallet
