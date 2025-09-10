import { Text, Theme, useTheme } from '@rneui/themed'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { setSelectedChatMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { formatFileSize } from '@fedi/common/utils/media'

import { useAppDispatch } from '../../../state/hooks'
import { useDownloadResource } from '../../../utils/hooks/media'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type ChatImageEventProps = {
    event: MatrixEvent<MatrixEventContentType<'m.file'>>
}

const ChatFileEvent: React.FC<ChatImageEventProps> = ({
    event,
}: ChatImageEventProps) => {
    const { isDownloading, handleDownload } = useDownloadResource(event)
    const { theme } = useTheme()
    const dispatch = useAppDispatch()

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const style = styles(theme)

    return (
        <Pressable style={style.attachment} onLongPress={handleLongPress}>
            <Flex grow row basis={false} align="center" gap="sm">
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
                    {isDownloading ? (
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
