import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

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
import Flex from '../../ui/Flex'
import Header from '../../ui/Header'
import SvgImage from '../../ui/SvgImage'
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
    const { t } = useTranslation()

    const style = useMemo(() => styles(theme), [theme])

    const name = useMemo(() => {
        if (room) return room?.name
        else if (preview) return preview?.info.name
        else if (user) return user?.displayName || user?.id
        return displayName || ''
    }, [displayName, preview, room, user])

    const avatar = useMemo(() => {
        if (room) return <ChatAvatar room={room} size={AvatarSize.sm} />
        else if (preview)
            return <ChatAvatar room={preview.info} size={AvatarSize.sm} />
        else if (user) return <ChatAvatar user={user} size={AvatarSize.sm} />
        else if (displayName) {
            const placeHolderUser = { id: '', displayName }
            return <ChatAvatar size={AvatarSize.sm} user={placeHolderUser} />
        }
        return (
            <Avatar
                size={AvatarSize.sm}
                id={''}
                name={name}
                maxFontSizeMultiplier={
                    theme.multipliers.headerMaxFontMultiplier
                }
            />
        )
    }, [displayName, name, preview, room, theme, user])

    const navigateToRoom = useCallback(() => {
        if (room) {
            navigation.navigate('RoomSettings', { roomId })
        }
    }, [navigation, room, roomId])

    const handleBackButtonPress = useCallback(() => {
        navigation.dispatch(resetToChatsScreen())
    }, [navigation])

    const HeaderCenter = useMemo(() => {
        const isNameEmpty = !name
        return (
            <Pressable
                style={style.memberContainer}
                hitSlop={10}
                onPress={() => {
                    // make sure we have joined room and its not just a preview to show admin settings
                    navigateToRoom()
                }}>
                <>
                    {isNameEmpty ? null : avatar}
                    <Flex row align="center">
                        <Text
                            bold
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            maxFontSizeMultiplier={
                                theme.multipliers.headerMaxFontMultiplier
                            }
                            style={style.memberText}>
                            {isNameEmpty
                                ? t('feature.chat.no-messages-header')
                                : name}
                        </Text>
                        {room?.directUserId && (
                            <Text
                                caption
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                maxFontSizeMultiplier={
                                    theme.multipliers.headerMaxFontMultiplier
                                }
                                style={style.shortIdText}>
                                {getUserSuffix(room.directUserId)}
                            </Text>
                        )}
                    </Flex>
                </>
            </Pressable>
        )
    }, [avatar, name, room, theme, style, navigateToRoom, t])

    return (
        <>
            <Header
                backButton
                onBackButtonPress={handleBackButtonPress}
                containerStyle={style.container}
                centerContainerStyle={style.headerCenterContainer}
                headerCenter={HeaderCenter}
                headerRight={
                    <Pressable onPress={() => navigateToRoom()}>
                        <SvgImage name="Profile" />
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
        shortIdText: {
            marginLeft: theme.spacing.xs,
        },
    })

export default ChatConversationHeader
