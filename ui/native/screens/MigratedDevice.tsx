import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'
import RNFS from 'react-native-fs'
import Share from 'react-native-share'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { prefixFileUri } from '@fedi/common/utils/media'

import { Column } from '../components/ui/Flex'
import HoloCircle from '../components/ui/HoloCircle'
import LineBreak from '../components/ui/LineBreak'
import type { RootStackParamList } from '../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'MigratedDevice'>

const MigratedDevice: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const fedimint = useFedimint()
    const [exportBridgeStateTapCount, setExportBridgeStateTapCount] =
        useState(0)
    useState(0)

    const style = styles(theme)

    const goToPersonalBackup = () => {
        navigation.navigate('RecoveryWords', {
            nextScreenParams: ['MigratedDeviceSuccess'],
        })
    }

    const handleExportBridgeStateTap = async () => {
        const newTapCount = exportBridgeStateTapCount + 1
        setExportBridgeStateTapCount(newTapCount)

        if (newTapCount > 21) {
            setExportBridgeStateTapCount(0)
            try {
                const timestamp = Date.now()
                const path = `${RNFS.TemporaryDirectoryPath}/bridge-state-${timestamp}.zip`

                await fedimint.internalExportBridgeState(path)

                await Share.open({
                    title: 'Export Bridge State',
                    url: prefixFileUri(path),
                })
            } catch (error) {
                toast.show({
                    content: 'Failed to export bridge state',
                    status: 'error',
                })
            }
        }
    }

    return (
        <Column grow justify="center" style={style.container}>
            <Column align="center" gap="lg" style={style.headerContainer}>
                <Pressable onPress={handleExportBridgeStateTap}>
                    <HoloCircle content={<Text>{'📲'}</Text>} size={64} />
                </Pressable>
                <Text h2 medium style={style.centeredText}>
                    {t('feature.recovery.device-migration-detected')}
                </Text>
            </Column>
            <Column justify="center" style={style.contentContainer}>
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
            </Column>
            <Button
                fullWidth
                onPress={goToPersonalBackup}
                containerStyle={style.buttonContainer}
                title={t('feature.backup.start-personal-backup')}
            />
        </Column>
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
