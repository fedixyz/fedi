import Clipboard from '@react-native-clipboard/clipboard'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import type { SocialRecoveryQrCode } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import CameraPermissionsRequired from '../components/feature/scan/CameraPermissionsRequired'
import QrCodeScanner from '../components/feature/scan/QrCodeScanner'
import { useBridge } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ScanSocialRecoveryCode')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ScanSocialRecoveryCode'
>

const ScanSocialRecoveryCode: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { socialRecoveryDownloadVerificationDoc } = useBridge()
    const { t } = useTranslation()
    const toast = useToast()
    const [downloading, setDownloading] = useState<boolean>(false)

    const handleUserInput = useCallback(
        async (input: string) => {
            if (downloading) return
            try {
                const qr: SocialRecoveryQrCode = JSON.parse(input)
                if (!qr)
                    throw new Error(
                        'Recovery QR should always exist in this context',
                    )
                try {
                    setDownloading(true)
                    // FIXME: this is getting called over-and-over
                    const videoPath =
                        await socialRecoveryDownloadVerificationDoc(
                            qr.recoveryId,
                        )
                    if (videoPath == null) {
                        toast.show(t('feature.recovery.nothing-to-download'))
                    } else {
                        navigation.navigate('CompleteRecoveryAssist', {
                            videoPath: videoPath as string,
                            recoveryId: qr.recoveryId,
                        })
                    }
                } catch (e) {
                    log.error("couldn't download video", e)
                    toast.show({
                        content: t('feature.recovery.download-failed'),
                        status: 'error',
                    })
                }
            } catch (e) {
                log.error("couldn't generate social recovery QR code", e)
                toast.show({
                    content: t('feature.recovery.invalid-qr-code'),
                    status: 'error',
                })
            }
            log.debug(input)
            setDownloading(false)
        },
        [
            downloading,
            navigation,
            toast,
            t,
            socialRecoveryDownloadVerificationDoc,
        ],
    )

    const checkClipboard = useCallback(async () => {
        const text = await Clipboard.getString()
        handleUserInput(text.trim())
    }, [handleUserInput])

    const renderQrCodeScanner = () => {
        if (downloading) {
            return (
                <View style={styles(theme).activityIndicator}>
                    <ActivityIndicator />
                </View>
            )
        } else {
            return (
                <QrCodeScanner
                    onQrCodeDetected={(qrCodeData: string) => {
                        handleUserInput(qrCodeData)
                    }}
                />
            )
        }
    }

    return (
        <CameraPermissionsRequired
            alternativeActionButton={
                <Button
                    title={t(
                        'feature.recovery.paste-social-recovery-code-instead',
                    )}
                    onPress={checkClipboard}
                    type="clear"
                />
            }
            message={t('feature.recovery.camera-access-information')}>
            <View style={styles(theme).container}>
                <View style={styles(theme).cameraScannerContainer}>
                    {renderQrCodeScanner()}
                </View>
                {/* <Button
                    title={t('feature.recovery.paste-social-recovery-code')}
                    // TODO: Swap commented code when bridge is ready
                    // onPress={checkClipboard}
                    onPress={() =>
                        handleUserInput(
                            'socialrecovery::pubkey::http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
                        )
                    }
                /> */}
            </View>
        </CameraPermissionsRequired>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        activityIndicator: {
            marginVertical: 'auto',
        },
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cameraScannerContainer: {
            height: '100%',
            width: '100%',
            margin: theme.spacing.lg,
        },
    })

export default ScanSocialRecoveryCode
