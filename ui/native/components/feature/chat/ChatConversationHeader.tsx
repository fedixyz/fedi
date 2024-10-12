import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import {
    selectGroupPreview,
    selectMatrixRoom,
    selectMatrixUser,
} from '@fedi/common/redux'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { useAppSelector } from '../../../state/hooks'
import { resetToChatsScreen } from '../../../state/navigation'
import { RootStackParamList } from '../../../types/navigation'
import Avatar, { AvatarSize } from '../../ui/Avatar'
import Header from '../../ui/Header'
import ChatAvatar from './ChatAvatar'
import { ChatConnectionBadge } from './ChatConnectionBadge'

type ChatRoomRouteProp = RouteProp<RootStackParamList, 'ChatRoomConversation'>
type ChatUserRouteProp = RouteProp<RootStackParamList, 'ChatUserConversation'>

const ChatConversationHeader: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation()
    const roomRoute = useRoute<ChatRoomRouteProp>()
    const userRoute = useRoute<ChatUserRouteProp>()
    const { roomId } = roomRoute.params
    const { userId, displayName } = userRoute.params
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const preview = useAppSelector(s => selectGroupPreview(s, roomId))
    const user = useAppSelector(s => selectMatrixUser(s, userId))

    const style = styles(theme)

    let avatar: React.ReactNode
    let name = ''
    if (room) {
        name = room?.name
        avatar = <ChatAvatar room={room} size={AvatarSize.sm} />
    } else if (preview) {
        name = preview?.info.name
        avatar = <ChatAvatar room={preview.info} size={AvatarSize.sm} />
    } else if (user) {
        name = user?.displayName || user?.id
        avatar = <ChatAvatar user={user} size={AvatarSize.sm} />
    } else if (displayName) {
        const placeHolderUser = { id: '', displayName }
        name = displayName
        avatar = <ChatAvatar size={AvatarSize.sm} user={placeHolderUser} />
    } else {
        avatar = (
            <Avatar
                size={AvatarSize.sm}
                id={''}
                name={name}
                maxFontSizeMultiplier={
                    theme.multipliers.headerMaxFontMultiplier
                }
            />
        )
    }

    return (
        <>
            <Header
                backButton
                onBackButtonPress={() =>
                    navigation.dispatch(resetToChatsScreen())
                }
                containerStyle={style.container}
                centerContainerStyle={style.headerCenterContainer}
                headerCenter={
                    <Pressable
                        style={style.memberContainer}
                        hitSlop={10}
                        onPress={() => {
                            // make sure we have joined room and its not just a preview to show admin settings
                            if (room) {
                                navigation.navigate('RoomSettings', { roomId })
                            }
                        }}>
                        {avatar}
                        <View style={style.textContainer}>
                            <Text
                                bold
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                maxFontSizeMultiplier={
                                    theme.multipliers.headerMaxFontMultiplier
                                }
                                style={style.memberText}>
                                {name}
                            </Text>
                            {room?.directUserId && (
                                <Text
                                    caption
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    maxFontSizeMultiplier={
                                        theme.multipliers
                                            .headerMaxFontMultiplier
                                    }
                                    style={style.shortIdText}>
                                    {getUserSuffix(room.directUserId)}
                                </Text>
                            )}
                        </View>
                    </Pressable>
                }
            />
            <ChatConnectionBadge offset={40} />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.xs,
        },
        headerLeftContainer: {
            height: theme.sizes.md,
            borderWidth: 1,
        },
        headerCenterContainer: {
            flex: 6,
        },
        memberText: {
            marginLeft: theme.spacing.sm,
        },
        memberContainer: {
            padding: theme.spacing.xs,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        textContainer: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        shortIdText: {
            marginLeft: theme.spacing.xs,
        },
    })

export default ChatConversationHeader
