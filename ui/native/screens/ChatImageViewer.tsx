import { ImageZoom } from '@likashefqet/react-native-image-zoom'
import { CameraRoll } from '@react-native-camera-roll/camera-roll'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
} from 'react-native'
import { exists } from 'react-native-fs'
import { PermissionStatus, RESULTS } from 'react-native-permissions'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'
import { useDownloadPermission } from '../utils/hooks'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatImageViewer'
>

const log = makeLog('ChatImageViewer')

const ChatImageViewer: React.FC<Props> = ({ route, navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { uri } = route.params
    const toast = useToast()
    const [isDownloading, setIsDownloading] = useState(false)
    const { downloadPermission, requestDownloadPermission } =
        useDownloadPermission()

    const handleDownload = useCallback(async () => {
        if (!uri || !(await exists(uri))) return

        setIsDownloading(true)

        try {
            let permissionStatus: PermissionStatus | undefined =
                downloadPermission

            if (downloadPermission !== RESULTS.GRANTED)
                permissionStatus = await requestDownloadPermission()

            if (permissionStatus === RESULTS.GRANTED) {
                await CameraRoll.saveAsset(uri, { type: 'photo' })
            } else {
                throw new Error(t('errors.please-grant-permission'))
            }

            toast.show({
                status: 'success',
                content:
                    Platform.OS === 'ios'
                        ? t('feature.chat.saved-to-photo-library')
                        : t('feature.chat.saved-to-pictures'),
            })
        } catch (e) {
            log.error('Failed to download image', e)
        } finally {
            setIsDownloading(false)
        }
    }, [uri, downloadPermission, requestDownloadPermission, t, toast])

    const style = styles(theme)

    return (
        <SafeAreaContainer style={style.imageViewerContainer} edges="vertical">
            <Flex
                row
                align="center"
                justify="between"
                style={style.imageViewerHeader}>
                <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
                    <SvgImage name="Close" color={theme.colors.secondary} />
                </Pressable>
                <Pressable hitSlop={10} onPress={handleDownload}>
                    {isDownloading ? (
                        <ActivityIndicator />
                    ) : (
                        <SvgImage
                            name="Download"
                            color={theme.colors.secondary}
                        />
                    )}
                </Pressable>
            </Flex>
            <ImageZoom uri={uri} style={style.imageZoomContainer} />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        imageViewerContainer: {
            backgroundColor: theme.colors.night,
        },
        imageZoomContainer: {
            flex: 1,
        },
        imageViewerHeader: {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
        },
    })

export default ChatImageViewer
