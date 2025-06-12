import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Flex from '../components/ui/Flex'
import HoloCircle from '../components/ui/HoloCircle'
import LineBreak from '../components/ui/LineBreak'
import type { RootStackParamList } from '../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'MigratedDevice'>

const MigratedDevice: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    const goToPersonalBackup = () => {
        navigation.navigate('RecoveryWords', {
            nextScreenParams: ['MigratedDeviceSuccess'],
        })
    }

    return (
        <Flex grow justify="center" style={style.container}>
            <Flex align="center" gap="lg" style={style.headerContainer}>
                <HoloCircle content={<Text>{'📲'}</Text>} size={64} />
                <Text h2 medium style={style.centeredText}>
                    {t('feature.recovery.device-migration-detected')}
                </Text>
            </Flex>
            <Flex justify="center" style={style.contentContainer}>
                <LineBreak />
                <Text medium>
                    {t('feature.recovery.migrated-device-guidance-1')}
                </Text>
                <LineBreak />
                <Text medium>
                    {t('feature.recovery.migrated-device-guidance-2')}
                </Text>
                <LineBreak />
                <Text medium>
                    {t('feature.recovery.migrated-device-guidance-3')}
                </Text>
                <LineBreak />
                <Text>{t('feature.recovery.migrated-device-guidance-4')}</Text>
            </Flex>
            <Button
                fullWidth
                onPress={goToPersonalBackup}
                containerStyle={style.buttonContainer}
                title={t('feature.backup.start-personal-backup')}
            />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
        },
        headerContainer: {
            marginTop: 'auto',
        },
        contentContainer: {
            padding: theme.spacing.lg,
        },
        centeredText: {
            textAlign: 'center',
        },
        buttonContainer: {
            marginTop: 'auto',
            marginBottom: theme.spacing.md,
        },
    })

export default MigratedDevice
