import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'
import { TemporaryDirectoryPath, exists } from 'react-native-fs'
import Share from 'react-native-share'

import { useToast } from '@fedi/common/hooks/toast'
import { setSelectedChatMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { JSONObject } from '@fedi/common/types/bindings'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { formatFileSize, pathJoin } from '@fedi/common/utils/media'

import { fedimint } from '../../../bridge'
import { useAppDispatch } from '../../../state/hooks'
import { prefixFileUri } from '../../../utils/media'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type ChatImageEventProps = {
    event: MatrixEvent<MatrixEventContentType<'m.file'>>
}

const ChatFileEvent: React.FC<ChatImageEventProps> = ({
    event,
}: ChatImageEventProps) => {
    const [isLoading, setIsLoading] = useState(false)
    const { theme } = useTheme()
    const toast = useToast()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const handleDownload = useCallback(async () => {
        setIsLoading(true)

        try {
            const path = pathJoin(TemporaryDirectoryPath, event.content.body)

            // bridge downloads the file to the path we provide
            const downloadedFilePath = await fedimint.matrixDownloadFile(
                path,
                event.content as JSONObject,
            )

            const downloadedFileUri = prefixFileUri(downloadedFilePath)

            if (await exists(downloadedFileUri)) {
                const filename =
                    Platform.OS === 'android'
                        ? event.content.body.replace(/\.[a-z]+$/, '')
                        : event.content.body

                try {
                    await Share.open({
                        filename,
                        type: event.content.info.mimetype,
                        url: downloadedFileUri,
                    })

                    toast.show({
                        content: t('feature.chat.file-saved'),
                        status: 'success',
                    })
                } catch {
                    /* no-op*/
                }
            }
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        } finally {
            setIsLoading(false)
        }
    }, [event.content, t, toast])

    const style = styles(theme)

    return (
        <Pressable style={style.attachment} onLongPress={handleLongPress}>
            <Flex grow row align="center" gap="sm">
                <View style={style.attachmentIcon}>
                    <SvgImage name="File" />
                </View>
                <Flex grow basis={false} gap="sm">
                    <Text medium ellipsizeMode="middle" numberOfLines={1}>
                        {event.content.body}
                    </Text>
                    <Text color={theme.colors.darkGrey} caption>
                        {formatFileSize(event.content.info.size ?? 0)}
                    </Text>
                </Flex>
            </Flex>
            <Pressable onPress={handleDownload}>
                <Flex center style={style.downloadButton}>
                    {isLoading ? (
                        <ActivityIndicator />
                    ) : (
                        <SvgImage name="Download" />
                    )}
                </Flex>
            </Pressable>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        attachment: {
            padding: theme.spacing.sm,
            borderRadius: 8,
            backgroundColor: theme.colors.offWhite,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            maxWidth: theme.sizes.maxMessageWidth,
            width: '100%',
        },
        attachmentIcon: {
            width: 48,
            height: 48,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.extraLightGrey,
            borderRadius: 8,
        },
        downloadButton: {
            width: 40,
            height: 40,
            borderRadius: 60,
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
        },
    })

export default ChatFileEvent
