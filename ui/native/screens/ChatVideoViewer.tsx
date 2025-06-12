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
import Video from 'react-native-video'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'
import { useDownloadPermission } from '../utils/hooks'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatVideoViewer'
>

const log = makeLog('ChatVideoViewer')

const ChatVideoViewer: React.FC<Props> = ({ route, navigation }: Props) => {
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
                await CameraRoll.saveAsset(uri, { type: 'video' })
            } else {
                throw new Error(t('errors.please-grant-permission'))
            }

            toast.show({
                status: 'success',
                content:
                    Platform.OS === 'ios'
                        ? t('feature.chat.saved-to-photo-library')
                        : t('feature.chat.saved-to-movies'),
            })
        } catch (e) {
            log.error('Failed to download video', e)
        } finally {
            setIsDownloading(false)
        }
    }, [uri, downloadPermission, requestDownloadPermission, t, toast])

    const style = styles(theme)

    return (
        <SafeAreaContainer style={style.fullScreenContainer} edges="vertical">
            <Flex
                row
                align="center"
                justify="between"
                style={style.fullScreenVideoHeader}>
                <Pressable
                    onPress={() => {
                        navigation.goBack()
                    }}>
                    <SvgImage name="Close" color={theme.colors.secondary} />
                </Pressable>
                <Pressable onPress={handleDownload}>
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
            <Video
                source={{ uri }}
                style={style.fullScreenVideo}
                controls
                resizeMode="contain"
            />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        fullScreenContainer: {
            backgroundColor: theme.colors.night,
        },
        fullScreenVideo: {
            flex: 1,
        },
        fullScreenVideoHeader: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.lg,
        },
    })

export default ChatVideoViewer
