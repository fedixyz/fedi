import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
    useJoinDefaultChat,
    useMatrixRoomPreview,
} from '@fedi/common/hooks/matrix'
import {
    selectChatTileName,
    selectIsUnpreviewablePrivateGroup,
} from '@fedi/common/redux'

import { DEFAULT_GROUP_NAME } from '../../../constants'
import { useAppSelector } from '../../../state/hooks'
import { MatrixRoom } from '../../../types'
import { NavigationHook } from '../../../types/navigation'
import { BubbleView } from '../../ui/BubbleView'
import { Column } from '../../ui/Flex'
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
    const navigation = useNavigation<NavigationHook>()
    const { text, isPublicBroadcast } = useMatrixRoomPreview({
        roomId: room?.id ?? '',
        t,
    })
    const { joinState, canJoin } = useJoinDefaultChat(room?.id ?? '', t)
    const isUnpreviewablePrivateGroup = useAppSelector(s =>
        selectIsUnpreviewablePrivateGroup(s, room?.id ?? ''),
    )
    const name = useAppSelector(s => selectChatTileName(s, room?.id ?? ''))

    const title =
        name ||
        (isUnpreviewablePrivateGroup
            ? t('feature.chat.private-group')
            : DEFAULT_GROUP_NAME)

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
                <Column center shrink={false} style={style.chatIcon}>
                    <SvgImage
                        name={isPublicBroadcast ? 'SpeakerPhone' : 'Chat'}
                    />
                </Column>
                <Column grow basis={false}>
                    <Text style={style.title} numberOfLines={1} bold>
                        {title}
                    </Text>
                    {text && (
                        <Text
                            small
                            style={style.subtitle}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            medium>
                            {text}
                        </Text>
                    )}
                </Column>
                {joinState === 'join' && canJoin ? (
                    // Open the room preview the invite scanner uses, so the
                    // user sees the room and confirms the join or knock there
                    // rather than committing straight from the tile. Nested in
                    // the row Pressable, the Button captures the tap so it
                    // doesn't also fire the row's onSelect.
                    <Button
                        size="sm"
                        onPress={() =>
                            navigation.navigate('RoomLink', {
                                roomId: room.id,
                            })
                        }
                        title={t('words.join')}
                        testID={`DefaultChatTileJoinButton-${room.name}`}
                        containerStyle={style.action}
                    />
                ) : joinState === 'pending' ? (
                    <Button
                        size="sm"
                        disabled
                        title={t('words.pending')}
                        testID={`DefaultChatTilePendingButton-${room.name}`}
                        containerStyle={style.action}
                    />
                ) : (
                    <SvgImage name="ChevronRight" color={theme.colors.grey} />
                )}
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
        action: {
            flexShrink: 0,
        },
    })

export default DefaultChatTile
