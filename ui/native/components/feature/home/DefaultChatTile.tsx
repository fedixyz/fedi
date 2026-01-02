import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useMatrixRoomPreview } from '@fedi/common/hooks/matrix'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { MatrixRoom } from '../../../types'
import { BubbleView } from '../../ui/BubbleView'
import Flex from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'

type DefaultChatTileProps = {
    room?: MatrixRoom
    imageUrl?: string
    onSelect?: (chat: MatrixRoom) => void
    onLongPress?: (chat: MatrixRoom) => void
}

const DefaultChatTile = ({
    room,
    onSelect = () => null,
    onLongPress = () => null,
}: DefaultChatTileProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { text, isPublicBroadcast } = useMatrixRoomPreview({
        roomId: room?.id ?? '',
        t,
    })

    const style = styles(theme)

    if (!room)
        return (
            <BubbleView containerStyle={style.card}>
                <ActivityIndicator size={theme.sizes.mediumAvatar} />
            </BubbleView>
        )

    return (
        <View style={style.card}>
            <Pressable
                containerStyle={style.content}
                onLongPress={() => onLongPress(room)}
                delayLongPress={300}
                onPress={() => onSelect(room)}>
                <Flex center shrink={false} style={style.chatIcon}>
                    <SvgImage
                        name={isPublicBroadcast ? 'SpeakerPhone' : 'Chat'}
                    />
                </Flex>
                <Flex grow basis={false}>
                    <Text style={style.title} numberOfLines={1} bold>
                        {room.name || DEFAULT_GROUP_NAME}
                    </Text>
                    {text && (
                        <Text
                            small
                            style={style.subtitle}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            medium>
                            {text}
                        </Text>
                    )}
                </Flex>
                <SvgImage name="ChevronRight" color={theme.colors.grey} />
            </Pressable>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        chatIcon: {
            width: 40,
            height: 40,
            position: 'relative',
        },
        card: {
            borderColor: theme.colors.extraLightGrey,
            borderWidth: 1,
            justifyContent: 'center',
            borderRadius: 16,
        },
        content: {
            display: 'flex',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
        },
        title: {
            letterSpacing: -0.16,
            lineHeight: 20,
        },
        subtitle: {
            color: theme.colors.grey,
            lineHeight: 15,
            letterSpacing: -0.12,
        },
    })

export default DefaultChatTile
