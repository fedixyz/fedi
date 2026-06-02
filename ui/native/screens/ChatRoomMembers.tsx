import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { usePendingJoinRequests } from '@fedi/common/hooks/matrix'
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

import { ChatKnockRequestActionsOverlay } from '../components/feature/chat/ChatKnockRequestActionsOverlay'
import ChatPendingRequestTile from '../components/feature/chat/ChatPendingRequestTile'
import { ChatUserActionsOverlay } from '../components/feature/chat/ChatUserActionsOverlay'
import ChatUserTile from '../components/feature/chat/ChatUserTile'
import { Column } from '../components/ui/Flex'
import { Switcher } from '../components/ui/Switcher'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { type RootStackParamList } from '../types/navigation'

export type ChatRoomMembersProps = NativeStackScreenProps<
    RootStackParamList,
    'ChatRoomMembers'
>

type MembersTab = 'members' | 'pending'

const ChatRoomMembers: React.FC<ChatRoomMembersProps> = ({
    route,
}: ChatRoomMembersProps) => {
    const { t } = useTranslation()
    const { roomId, displayMultispendRoles, initialTab } = route.params
    const { theme } = useTheme()

    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [selectedPendingUserId, setSelectedPendingUserId] = useState<
        string | null
    >(null)
    const [activeTab, setActiveTab] = useState<MembersTab>(
        initialTab ?? 'members',
    )
    const myUserId = useAppSelector(selectMatrixAuth)?.userId
    const members = useAppSelector(s => selectMatrixRoomMembersByMe(s, roomId))
    const [isRefetching, setIsRefetching] = useState(false)
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    const {
        canRespond,
        pendingMembers,
        pendingCount,
        processingUserId,
        markSeen,
        accept,
        decline,
    } = usePendingJoinRequests(roomId, t)

    // Pending is admin/mod only and irrelevant in the multispend roles view
    const showTabs = canRespond && !displayMultispendRoles
    const tab: MembersTab = showTabs ? activeTab : 'members'

    // viewing the pending list acknowledges the current requests
    useEffect(() => {
        if (tab === 'pending') markSeen()
    }, [tab, markSeen])

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

    const renderPending: ListRenderItem<MatrixRoomMember> = ({ item }) => (
        <ChatPendingRequestTile
            member={item}
            onPress={setSelectedPendingUserId}
            testID="KnockRequestTile"
        />
    )

    const style = styles(theme)

    const groupMembersList =
        displayMultispendRoles && multispendStatus
            ? sortMultispendRoomMembers(members, multispendStatus)
            : members

    const selectedPendingMember =
        pendingMembers.find(m => m.id === selectedPendingUserId) ?? null

    return (
        <Column grow fullWidth style={style.container}>
            {showTabs && (
                <View style={style.switcher}>
                    <Switcher<MembersTab>
                        options={[
                            { label: t('words.members'), value: 'members' },
                            {
                                label: t('words.pending'),
                                value: 'pending',
                                count: pendingCount,
                            },
                        ]}
                        selected={tab}
                        onChange={setActiveTab}
                    />
                </View>
            )}
            {tab === 'pending' ? (
                pendingMembers.length === 0 ? (
                    <Column center grow gap="md">
                        <Text
                            testID="NoKnockRequestsEmpty"
                            style={style.emptyText}>
                            {t('feature.chat.no-knock-requests')}
                        </Text>
                    </Column>
                ) : (
                    <FlatList
                        testID="KnockRequestsList"
                        data={pendingMembers}
                        renderItem={renderPending}
                        keyExtractor={(item: MatrixRoomMember) => `${item.id}`}
                        contentContainerStyle={style.membersListContainer}
                        showsVerticalScrollIndicator={false}
                    />
                )
            ) : (
                <FlatList
                    data={groupMembersList}
                    renderItem={renderMember}
                    keyExtractor={(item: MatrixRoomMember) => `${item.id}`}
                    contentContainerStyle={style.membersListContainer}
                    onRefresh={handleRefresh}
                    refreshing={isRefetching}
                    showsVerticalScrollIndicator={false}
                />
            )}
            <ChatUserActionsOverlay
                onDismiss={() => {
                    backgroundRefresh()
                    setSelectedUserId(null)
                }}
                selectedUserId={selectedUserId}
                roomId={roomId}
            />
            <ChatKnockRequestActionsOverlay
                member={selectedPendingMember}
                isProcessing={processingUserId === selectedPendingUserId}
                onAccept={async userId => {
                    await accept(userId)
                    setSelectedPendingUserId(null)
                }}
                onDecline={async userId => {
                    await decline(userId)
                    setSelectedPendingUserId(null)
                }}
                onDismiss={() => setSelectedPendingUserId(null)}
            />
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
        },
        switcher: {
            marginBottom: theme.spacing.lg,
        },
        membersListContainer: {},
        emptyText: {
            textAlign: 'center',
            color: theme.colors.darkGrey,
        },
    })

export default ChatRoomMembers
