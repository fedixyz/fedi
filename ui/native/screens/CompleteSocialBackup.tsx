import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet } from 'react-native'
import Share from 'react-native-share'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { locateRecoveryFile } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

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

            // Deliberately avoid awaiting Share.open
            // as Android for some reason doesn't resolve the promise
            Share.open({
                title: 'Fedi Backup File',
                url: recoveryFilePath,
                filename: FILE_NAME,
            })

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
                                : t('words.continue')
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
                    {hasBackedUp && (
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
