import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useDeviceRegistration } from '@fedi/common/hooks/recovery'

import { fedimint } from '../bridge'
import Flex from '../components/ui/Flex'
import HoloCircle from '../components/ui/HoloCircle'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { reset } from '../state/navigation'
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
        handleNewWallet(() => {
            navigation.dispatch(reset('TabsNavigator'))
        })
    }

    return (
        <Flex grow center gap="lg" style={style.container}>
            <Flex align="center" gap="lg" style={style.centeredContainer}>
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
            </Flex>
            <Text caption style={style.subText}>
                {t('words.enjoy')}
            </Text>
            <Button
                fullWidth
                title={t('words.continue')}
                onPress={handleContinue}
            />
        </Flex>
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

export default RecoveryNewWallet
