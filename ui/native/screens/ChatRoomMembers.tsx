import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native'

import {
    refetchMatrixRoomMembers,
    selectMatrixAuth,
    selectMatrixRoomMembersByMe,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'

import { ChatUserActionsOverlay } from '../components/feature/chat/ChatUserActionsOverlay'
import ChatUserTile from '../components/feature/chat/ChatUserTile'
import { PressableIcon } from '../components/ui/PressableIcon'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'
import { NavigationHook } from '../types/navigation'

export type ChatRoomMembersProps = NativeStackScreenProps<
    RootStackParamList,
    'ChatRoomMembers'
>

const ChatRoomMembers: React.FC<ChatRoomMembersProps> = ({
    route,
}: ChatRoomMembersProps) => {
    const { t } = useTranslation()
    const { roomId } = route.params
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const dispatch = useAppDispatch()
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const myUserId = useAppSelector(selectMatrixAuth)?.userId
    const members = useAppSelector(s => selectMatrixRoomMembersByMe(s, roomId))
    const me = members.find(m => m.id === myUserId)
    const [isRefetching, setIsRefetching] = useState(false)
    const handleSelectMember = useCallback((userId: string) => {
        requestAnimationFrame(() => setSelectedUserId(userId))
    }, [])

    const handleRefresh = useCallback(() => {
        setIsRefetching(true)
        roomId &&
            dispatch(refetchMatrixRoomMembers(roomId)).catch(() => {
                // no-op
            })

        setTimeout(() => setIsRefetching(false), 500)
        // Dismissing any sooner looks weird
    }, [dispatch, roomId])

    const handleInviteMember = useCallback(() => {
        if (me?.powerLevel === MatrixPowerLevel.Member) return

        navigation.replace('ChatRoomInvite', { roomId })
    }, [navigation, roomId, me])

    const renderMember: ListRenderItem<MatrixRoomMember> = ({ item }) => {
        const isMe = item.id === myUserId
        const displayName = isMe ? t('words.you') : item.displayName
        const member = { ...item, displayName }

        return (
            <ChatUserTile
                user={member}
                selectUser={handleSelectMember}
                disabled={isMe}
                // Even though we display the current user as "you",
                // we still want the user's avatar to show the
                // initials of their "real" display name
                overrideAvatarName={isMe ? item.displayName : undefined}
                showAdmin={member.powerLevel >= MatrixPowerLevel.Admin}
                rightIcon={
                    <Text small color={theme.colors.grey}>
                        {member.powerLevel >= MatrixPowerLevel.Admin
                            ? t('words.admin')
                            : member.powerLevel >= MatrixPowerLevel.Moderator
                            ? t('words.moderator')
                            : t('words.member')}
                    </Text>
                }
                showSuffix={!isMe}
            />
        )
    }

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.titleContainer}>
                <Text h2>{t('words.members')}</Text>
                <PressableIcon
                    onPress={handleInviteMember}
                    svgName="Plus"
                    hitSlop={5}
                    disabled={me?.powerLevel === MatrixPowerLevel.Member}
                />
            </View>
            <FlatList
                data={members}
                renderItem={renderMember}
                keyExtractor={(item: MatrixRoomMember) => `${item.id}`}
                contentContainerStyle={style.membersListContainer}
                onRefresh={handleRefresh}
                refreshing={isRefetching}
                showsVerticalScrollIndicator={false}
            />
            <ChatUserActionsOverlay
                onDismiss={() =>
                    requestAnimationFrame(() => setSelectedUserId(null))
                }
                selectedUserId={selectedUserId}
                roomId={roomId}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            padding: theme.spacing.lg,
        },
        titleContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.sm,
        },
        instructions: {
            lineHeight: 20,
        },
        membersListContainer: {},
        buttonContainer: {
            marginTop: 'auto',
        },
    })

export default ChatRoomMembers
