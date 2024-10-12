import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, StyleSheet, View } from 'react-native'
import Share from 'react-native-share'

import { selectActiveFederationId } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import HoloGuidance from '../components/ui/HoloGuidance'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppSelector, useBridge } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('SocialBackupCloudUpload')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'SocialBackupCloudUpload'
>

const SocialBackupCloudUpload: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const { locateRecoveryFile } = useBridge(activeFederationId)

    const shareVideo = async () => {
        try {
            const recoveryFilePath = await locateRecoveryFile()
            await Share.open({ url: recoveryFilePath })
            navigation.navigate('CompleteSocialBackup')
        } catch (error) {
            log.error('shareVideo', error)
        }
    }

    return (
        <View style={styles(theme).container}>
            <HoloGuidance
                iconImage={
                    <SvgImage name="GoogleDrive" size={SvgImageSize.lg} />
                }
                title={t('feature.backup.cloud-backup')}
                message={t('feature.backup.cloud-backup-instructions')}
            />
            <View style={styles(theme).buttonsContainer}>
                <Button
                    title={t('words.skip')}
                    type="clear"
                    onPress={() => {
                        navigation.navigate('CompleteSocialBackup')
                    }}
                />
                <Button
                    title={t('feature.backup.backup-to-google-drive')}
                    containerStyle={styles(theme).continueButton}
                    onPress={() => {
                        shareVideo()
                    }}
                />
            </View>
        </View>
    )
}

const WINDOW_WIDTH = Dimensions.get('window').width
const CIRCLE_SIZE = WINDOW_WIDTH * 0.45

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
        },
        label: {
            textAlign: 'center',
            marginVertical: theme.spacing.lg,
        },
        instructionsText: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
        },
        holoCircle: {
            height: CIRCLE_SIZE,
            width: CIRCLE_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
        },
        circleBorder: {
            borderRadius: CIRCLE_SIZE * 0.5,
        },
        holoIconImage: {
            height: theme.sizes.lg,
            width: theme.sizes.lg,
        },
        buttonsContainer: {
            marginTop: 'auto',
            alignItems: 'center',
            width: '100%',
        },
        continueButton: {
            width: '100%',
            marginVertical: theme.spacing.md,
        },
    })

export default SocialBackupCloudUpload
