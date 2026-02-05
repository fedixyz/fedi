import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Platform, StyleSheet } from 'react-native'
import RNFS from 'react-native-fs'
import Share from 'react-native-share'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { locateRecoveryFile } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'
import { pathJoin } from '@fedi/common/utils/media'

import { Images } from '../assets/images'
import { Column } from '../components/ui/Flex'
import GradientView from '../components/ui/GradientView'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import {
    completeSocialBackup,
    useBackupRecoveryContext,
} from '../state/contexts/BackupRecoveryContext'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('CompleteSocialBackup')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CompleteSocialBackup'
>

const FILE_NAME = 'backup.fedi'

const CompleteSocialBackup: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const appDispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { dispatch } = useBackupRecoveryContext()
    const [isCreatingBackup, setIsCreatingBackup] = useState(false)
    const [hasBackedUp, setHasBackedUp] = useState(false)

    const toast = useToast()

    const createBackup = async () => {
        setIsCreatingBackup(true)
        try {
            const recoveryFilePath = await appDispatch(
                locateRecoveryFile(fedimint),
            ).unwrap()

            const exists = await RNFS.exists(recoveryFilePath)

            if (!recoveryFilePath || !exists) {
                log.error('No recovery file found')
                return
            }

            // Share.open does not seem to work with Android
            // so we save the file to the Downloads directory instead
            if (Platform.OS === 'android') {
                const destinationPath = pathJoin(
                    RNFS.DownloadDirectoryPath,
                    FILE_NAME,
                )

                const backupContents = await RNFS.readFile(
                    recoveryFilePath,
                    'base64',
                )

                await RNFS.writeFile(destinationPath, backupContents, 'base64')

                toast.show({
                    content: t('feature.chat.saved-to-downloads'),
                    status: 'success',
                })
            } else {
                await Share.open({
                    title: 'Fedi Backup File',
                    url: recoveryFilePath,
                    filename: FILE_NAME,
                })
            }

            setHasBackedUp(true)
        } catch (error) {
            log.error('createBackup', error)
            toast.error(t, error)
        } finally {
            setIsCreatingBackup(false)
        }
    }

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="bottom">
            <Column grow style={style.container}>
                <Column grow center gap="md">
                    <GradientView
                        variant="sky-banner"
                        style={style.iconWrapper}>
                        <Image
                            source={Images.SocialRecoveryFileIcon}
                            style={{ height: 60, width: 60 }}
                        />
                    </GradientView>
                    <Text h2 center bold>
                        {t('feature.backup.complete-backup-save-file')}
                    </Text>
                    <Text center style={{ color: theme.colors.darkGrey }}>
                        {t('feature.backup.complete-backup-save-file-help')}
                    </Text>
                </Column>
                <Column gap="md">
                    <Button
                        fullWidth
                        title={
                            !hasBackedUp
                                ? t('feature.backup.save-file')
                                : t('words.done')
                        }
                        onPress={() => {
                            if (!hasBackedUp) {
                                createBackup()
                            } else {
                                dispatch(completeSocialBackup())
                                navigation.navigate('SocialBackupSuccess')
                            }
                        }}
                        loading={isCreatingBackup}
                    />
                </Column>
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
        },
        iconWrapper: {
            alignItems: 'center',
            borderRadius: '100%',
            display: 'flex',
            justifyContent: 'center',
            height: 120,
            width: 120,
        },
    })

export default CompleteSocialBackup
