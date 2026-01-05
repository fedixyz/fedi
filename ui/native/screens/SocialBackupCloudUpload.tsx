import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import Share from 'react-native-share'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { locateRecoveryFile } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { Column } from '../components/ui/Flex'
import HoloGuidance from '../components/ui/HoloGuidance'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('SocialBackupCloudUpload')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SocialBackupCloudUpload'
>

const SocialBackupCloudUpload: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()

    const shareVideo = async () => {
        try {
            const recoveryFilePath = await dispatch(
                locateRecoveryFile(fedimint),
            ).unwrap()
            await Share.open({ url: recoveryFilePath })
            navigation.navigate('CompleteSocialBackup')
        } catch (error) {
            log.error('shareVideo', error)
        }
    }

    const style = styles(theme)

    return (
        <Column grow center style={style.container}>
            <HoloGuidance
                iconImage={
                    <SvgImage name="GoogleDrive" size={SvgImageSize.lg} />
                }
                title={t('feature.backup.cloud-backup')}
                message={t('feature.backup.cloud-backup-instructions')}
            />
            <Column align="center" fullWidth style={style.buttonsContainer}>
                <Button
                    title={t('words.skip')}
                    type="clear"
                    onPress={() => {
                        navigation.navigate('CompleteSocialBackup')
                    }}
                />
                <Button
                    title={t('feature.backup.backup-to-google-drive')}
                    containerStyle={style.continueButton}
                    onPress={() => {
                        shareVideo()
                    }}
                />
            </Column>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
        },
        buttonsContainer: {
            marginTop: 'auto',
        },
        continueButton: {
            width: '100%',
            marginVertical: theme.spacing.md,
        },
    })

export default SocialBackupCloudUpload
