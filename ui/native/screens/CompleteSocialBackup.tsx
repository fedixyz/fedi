import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet } from 'react-native'
import RNFS from 'react-native-fs'
import Share from 'react-native-share'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { locateRecoveryFile } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

// import { prefixFileUri } from '@fedi/common/utils/media'
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

const BACKUPS_REQUIRED = 2

const CompleteSocialBackup: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const appDispatch = useAppDispatch()
    const fedimint = useFedimint()
    const [backupsCompleted, setBackupsCompleted] = useState<number>(0)
    const { dispatch } = useBackupRecoveryContext()
    const [isCreatingBackup, setIsCreatingBackup] = useState(false)

    const createBackup = async () => {
        setIsCreatingBackup(true)
        try {
            const recoveryFilePath = await appDispatch(
                locateRecoveryFile(fedimint),
            ).unwrap()

            log.info('recoveryFilePath', recoveryFilePath)
            log.info(
                'recoveryFilePath exists',
                await RNFS.exists(recoveryFilePath),
            )
            log.info('recoveryFilePath stat', await RNFS.stat(recoveryFilePath))

            if (!recoveryFilePath) {
                log.error('No recovery file found')
                return
            }

            await Share.open({
                title: 'Fedi Backup File',
                url: recoveryFilePath,
                type: 'application/octet-stream',
                failOnCancel: false,
            })

            setBackupsCompleted(
                Math.min(BACKUPS_REQUIRED, backupsCompleted + 1),
            )
        } catch (error) {
            log.error('createBackup', error)
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
                            backupsCompleted === 0
                                ? t('feature.backup.save-file')
                                : t('words.done')
                        }
                        onPress={() => {
                            if (backupsCompleted === 0) {
                                createBackup()
                            } else {
                                dispatch(completeSocialBackup())
                                navigation.navigate('SocialBackupSuccess')
                            }
                        }}
                        loading={isCreatingBackup}
                    />
                    {backupsCompleted > 0 && (
                        <Button
                            fullWidth
                            type="clear"
                            title={t(
                                'feature.backup.save-your-wallet-backup-file-again',
                            )}
                            onPress={createBackup}
                            loading={isCreatingBackup}
                        />
                    )}
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
