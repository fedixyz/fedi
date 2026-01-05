import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import {
    refetchMatrixRoomMembers,
    selectMatrixAuth,
    selectMatrixRoomMembersByMe,
    selectMatrixRoomMultispendStatus,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'
import {
    getMultispendRole,
    isPowerLevelGreaterOrEqual,
    sortMultispendRoomMembers,
} from '@fedi/common/utils/matrix'

import { ChatUserActionsOverlay } from '../components/feature/chat/ChatUserActionsOverlay'
import ChatUserTile from '../components/feature/chat/ChatUserTile'
import Flex from '../components/ui/Flex'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { type RootStackParamList } from '../types/navigation'

export type ChatRoomMembersProps = NativeStackScreenProps<
    RootStackParamList,
    'ChatRoomMembers'
>

const ChatRoomMembers: React.FC<ChatRoomMembersProps> = ({
    route,
}: ChatRoomMembersProps) => {
    const { t } = useTranslation()
    const { roomId, displayMultispendRoles } = route.params
    const { theme } = useTheme()

    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const myUserId = useAppSelector(selectMatrixAuth)?.userId
    const members = useAppSelector(s => selectMatrixRoomMembersByMe(s, roomId))
    const [isRefetching, setIsRefetching] = useState(false)
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const handleSelectMember = useCallback((userId: string) => {
        requestAnimationFrame(() => setSelectedUserId(userId))
    }, [])

    const backgroundRefresh = useCallback(() => {
        roomId &&
            dispatch(refetchMatrixRoomMembers({ fedimint, roomId })).catch(
                () => {
                    // no-op
                },
            )
    }, [dispatch, roomId, fedimint])

    const handleRefresh = useCallback(() => {
        setIsRefetching(true)
        backgroundRefresh()

        // Dismissing any sooner looks weird
        setTimeout(() => setIsRefetching(false), 500)
    }, [backgroundRefresh])

    const renderMember: ListRenderItem<MatrixRoomMember> = ({ item }) => {
        const isMe = item.id === myUserId
        const displayName = isMe ? t('words.you') : item.displayName
        const member = { ...item, displayName }

        const memberPowerLevelText = isPowerLevelGreaterOrEqual(
            member.powerLevel,
            MatrixPowerLevel.Admin,
        )
            ? t('words.admin')
            : isPowerLevelGreaterOrEqual(
                    member.powerLevel,
                    MatrixPowerLevel.Moderator,
                )
              ? t('words.moderator')
              : t('words.member')

        const multispendPowerLevel = multispendStatus
            ? getMultispendRole(multispendStatus, member.id)
            : 'member'
        const multispendPowerLevelText =
            multispendPowerLevel === 'member'
                ? t('words.member')
                : t('words.voter')

        return (
            <ChatUserTile
                user={member}
                selectUser={handleSelectMember}
                disabled={isMe}
                // Even though we display the current user as "you",
                // we still want the user's avatar to show the
                // initials of their "real" display name
                overrideAvatarName={isMe ? item.displayName : undefined}
                showAdmin={isPowerLevelGreaterOrEqual(
                    member.powerLevel,
                    MatrixPowerLevel.Admin,
                )}
                rightIcon={
                    <>
                        <Text small color={theme.colors.grey}>
                            {displayMultispendRoles
                                ? multispendPowerLevelText
                                : memberPowerLevelText}
                        </Text>
                        <Text small color={theme.colors.grey}>
                            {member.ignored ? `(${t('words.blocked')})` : ''}
                        </Text>
                    </>
                }
                showSuffix={!isMe}
            />
        )
    }

    const style = styles(theme)

    const groupMembersList =
        displayMultispendRoles && multispendStatus
            ? sortMultispendRoomMembers(members, multispendStatus)
            : members

    return (
        <Flex grow fullWidth style={style.container}>
            <FlatList
                data={groupMembersList}
                renderItem={renderMember}
                keyExtractor={(item: MatrixRoomMember) => `${item.id}`}
                contentContainerStyle={style.membersListContainer}
                onRefresh={handleRefresh}
                refreshing={isRefetching}
                showsVerticalScrollIndicator={false}
            />
            <ChatUserActionsOverlay
                onDismiss={() => {
                    backgroundRefresh()
                    setSelectedUserId(null)
                }}
                selectedUserId={selectedUserId}
                roomId={roomId}
            />
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
        },
        titleContainer: {
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
