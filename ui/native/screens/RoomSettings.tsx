import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'

import { useMultispendDisplayUtils } from '@fedi/common/hooks/multispend'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { useToast } from '@fedi/common/hooks/toast'
import {
    ignoreUser,
    leaveMatrixRoom,
    selectIsDefaultGroup,
    selectMatrixRoom,
    selectMatrixRoomMembersCount,
    selectMatrixRoomMultispendStatus,
    selectMatrixRoomSelfPowerLevel,
    selectMyMultispendRole,
    selectShouldShowMultispend,
    setMatrixRoomBroadcastOnly,
    unignoreUser,
} from '@fedi/common/redux'
import { MatrixPowerLevel } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { isPowerLevelGreaterOrEqual } from '@fedi/common/utils/matrix'

import { fedimint } from '../bridge'
import { ChatSettingsAvatar } from '../components/feature/chat/ChatSettingsAvatar'
import { ConfirmBlockOverlay } from '../components/feature/chat/ConfirmBlockOverlay'
import SettingsItem, {
    SettingsItemProps,
} from '../components/feature/settings/SettingsItem'
import Flex from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToChatsScreen } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'
import { useLaunchZendesk } from '../utils/hooks/support'

export type Props = NativeStackScreenProps<RootStackParamList, 'RoomSettings'>

const RoomSettings: React.FC<Props> = ({ navigation, route }: Props) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { show } = useToast()
    const { launchZendesk } = useLaunchZendesk()
    const toast = useToast()
    const { roomId } = route.params
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const memberCount = useAppSelector(s =>
        selectMatrixRoomMembersCount(s, roomId),
    )
    const myPowerLevel = useAppSelector(s =>
        selectMatrixRoomSelfPowerLevel(s, roomId || ''),
    )
    const isAdmin =
        myPowerLevel &&
        isPowerLevelGreaterOrEqual(myPowerLevel, MatrixPowerLevel.Admin)
    const { shouldBlockLeaveRoom } = useMultispendDisplayUtils(t, roomId)
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const myMultispendRole = useAppSelector(s =>
        selectMyMultispendRole(s, roomId),
    )
    const shouldShowMultispend = useAppSelector(selectShouldShowMultispend)
    const isDefaultGroup = useAppSelector(s => selectIsDefaultGroup(s, roomId))
    const isGroupChat = !room?.directUserId
    const [isTogglingBroadcastOnly, setIsTogglingBroadcastOnly] =
        useState(false)

    const [isConfirmingBlock, setIsConfirmingBlock] = useState(false)
    const [isBlockingUser, setIsBlockingUser] = useState(false)

    const [hasSeenMultispendIntro, seeMultispendIntro] = useNuxStep(
        'hasSeenMultispendIntro',
    )

    const isIgnored = !!room?.isBlocked

    const leaveChat = useCallback(async () => {
        // Immediately navigate and replace navigation stack on leave
        // attempt, otherwise pressing the back button or useEffects in
        // backgrounded screens may attempt to re-join the group right
        // after we leave it.
        try {
            navigation.dispatch(resetToChatsScreen())
            await dispatch(leaveMatrixRoom({ fedimint, roomId })).unwrap()
        } catch (err) {
            toast.error(t, err)
        }
    }, [dispatch, navigation, roomId, t, toast])

    const handleLeaveChat = useCallback(() => {
        if (shouldBlockLeaveRoom) {
            toast.show({
                content: t('feature.multispend.leave-group-message'),
                status: 'error',
            })

            return
        }

        Alert.alert(
            isGroupChat
                ? t('feature.chat.leave-group')
                : t('feature.chat.leave-chat'),
            isGroupChat
                ? t('feature.chat.leave-group-confirmation')
                : t('feature.chat.leave-chat-confirmation'),
            [
                {
                    text: t('words.cancel'),
                },
                {
                    text: t('words.yes'),
                    onPress: () => leaveChat(),
                },
            ],
        )
    }, [isGroupChat, leaveChat, t, shouldBlockLeaveRoom, toast])

    const handleChangeGroupName = useCallback(() => {
        navigation.navigate('EditGroup', { roomId })
    }, [navigation, roomId])

    const blockUser = useCallback(async () => {
        try {
            if (!room?.directUserId) return
            setIsBlockingUser(true)
            await dispatch(
                ignoreUser({ fedimint, userId: room.directUserId }),
            ).unwrap()
            setIsBlockingUser(false)
            setIsConfirmingBlock(false)
            show({
                content: t('feature.chat.block-user-success'),
                status: 'success',
            })
        } catch (error) {
            toast.error(t, t('feature.chat.block-user-failure'))
        }
    }, [dispatch, room?.directUserId, show, t, toast])

    const unblockUser = useCallback(async () => {
        try {
            if (!room?.directUserId) return
            setIsBlockingUser(true)

            await dispatch(
                unignoreUser({ fedimint, userId: room.directUserId }),
            ).unwrap()

            setIsBlockingUser(false)
            setIsConfirmingBlock(false)
            show({
                content: t('feature.chat.unblock-user-success'),
                status: 'success',
            })
        } catch (error) {
            toast.error(t, t('feature.chat.unblock-user-failure'))
        }
    }, [dispatch, room?.directUserId, show, t, toast])

    const handleViewMembers = useCallback(() => {
        navigation.navigate('ChatRoomMembers', { roomId })
    }, [navigation, roomId])

    const handleInviteMember = useCallback(() => {
        navigation.navigate('ChatRoomInvite', { roomId })
    }, [navigation, roomId])

    const handleToggleBroadcastOnly = useCallback(async () => {
        if (isTogglingBroadcastOnly || !room) return
        if (isDefaultGroup) {
            toast.error(t, 'errors.default-groups-must-be-broadcast')
            return
        }
        if (multispendStatus) {
            toast.error(t, 'errors.multispend-cannot-be-broadcast')
            return
        }
        setIsTogglingBroadcastOnly(true)
        try {
            await dispatch(
                setMatrixRoomBroadcastOnly({
                    fedimint,
                    roomId: room.id,
                    broadcastOnly: !room.broadcastOnly,
                }),
            ).unwrap()
        } catch (err) {
            toast.error(t, 'errors.unknown-error')
        }
        setIsTogglingBroadcastOnly(false)
    }, [
        isDefaultGroup,
        isTogglingBroadcastOnly,
        room,
        dispatch,
        toast,
        t,
        multispendStatus,
    ])

    const handleNavigateToMultispend = useCallback(() => {
        if (!multispendStatus && isAdmin) {
            if (!hasSeenMultispendIntro) {
                seeMultispendIntro()
                navigation.navigate('MultispendIntro', {
                    roomId,
                })
            } else {
                navigation.navigate('CreateMultispend', { roomId })
            }
        } else if (myMultispendRole !== null) {
            navigation.navigate('GroupMultispend', { roomId })
        }
    }, [
        roomId,
        navigation,
        myMultispendRole,
        isAdmin,
        multispendStatus,
        hasSeenMultispendIntro,
        seeMultispendIntro,
    ])

    const style = styles(theme)
    const settingsItems = useMemo(() => {
        const items: SettingsItemProps[] = []
        if (isGroupChat) {
            // don't show members list for direct chats
            // admins can always see the members list
            // non-default groups: anyone can see members list
            if (isAdmin || !isDefaultGroup) {
                items.push({
                    icon: 'SocialPeople',
                    label: `${amountUtils.formatNumber(memberCount)} ${t(
                        'words.members',
                    )}`,
                    onPress: handleViewMembers,
                })
            }

            items.push(
                {
                    icon: 'Room',
                    label: t('feature.chat.invite-to-group'),
                    onPress: handleInviteMember,
                    disabled: !isAdmin,
                },
                {
                    icon: 'LeaveRoom',
                    label: t('feature.chat.leave-group'),
                    onPress: handleLeaveChat,
                },
                {
                    icon: 'Edit',
                    label: t('feature.chat.change-group-name'),
                    onPress: handleChangeGroupName,
                    disabled: !isAdmin,
                },
                {
                    icon: 'SpeakerPhone',
                    label: t('feature.chat.broadcast-only'),
                    action: (
                        <Switch
                            style={style.switch}
                            value={room?.broadcastOnly}
                            disabled={isTogglingBroadcastOnly || !isAdmin}
                            onValueChange={handleToggleBroadcastOnly}
                        />
                    ),
                    isLoading: isTogglingBroadcastOnly,
                    disabled: !isAdmin,
                    onPress: handleToggleBroadcastOnly,
                },
            )

            if (
                shouldShowMultispend &&
                isGroupChat &&
                !room?.isPublic &&
                !room?.broadcastOnly
            ) {
                items.push({
                    icon: 'Wallet',
                    label: t('words.multispend'),
                    onPress: handleNavigateToMultispend,
                    disabled:
                        multispendStatus?.status === 'activeInvitation' ||
                        multispendStatus?.status === 'finalized'
                            ? myMultispendRole === null
                            : !isAdmin,
                })
            }
        } else {
            items.push(
                // Prevents users from leaving DMs due to duplicate DM rooms being created
                // https://github.com/fedibtc/fedi/issues/6530
                // {
                //     icon: 'LeaveRoom',
                //     label: t('feature.chat.leave-chat'),
                //     onPress: handleLeaveChat,
                // },
                {
                    icon: 'BlockMember',
                    label: isIgnored
                        ? t('feature.chat.unblock-user')
                        : t('feature.chat.block-user'),
                    onPress: () => {
                        setIsConfirmingBlock(true)
                    },
                    color: theme.colors.red,
                },
            )
        }
        items.push({
            icon: 'SmileMessage',
            label: t('feature.support.title'),
            onPress: () => launchZendesk(),
        })
        return items
    }, [
        handleNavigateToMultispend,
        handleChangeGroupName,
        handleInviteMember,
        handleLeaveChat,
        handleToggleBroadcastOnly,
        handleViewMembers,
        launchZendesk,
        isAdmin,
        isDefaultGroup,
        isGroupChat,
        isTogglingBroadcastOnly,
        memberCount,
        room?.broadcastOnly,
        room?.isPublic,
        style.switch,
        t,
        theme.colors.red,
        isIgnored,
        multispendStatus,
        shouldShowMultispend,
        myMultispendRole,
    ])

    if (!room) return <HoloLoader />

    return (
        <>
            <View style={style.container}>
                <ChatSettingsAvatar room={room} />
                <ScrollView
                    bounces={false}
                    contentContainerStyle={style.content}>
                    <Flex gap="lg">
                        <Text color={theme.colors.primaryLight}>
                            {t('feature.chat.chat-settings')}
                        </Text>
                        <View style={style.settingsItems}>
                            {settingsItems.map((item, index) => (
                                <SettingsItem key={`si-${index}`} {...item} />
                            ))}
                        </View>
                    </Flex>
                </ScrollView>
            </View>
            <ConfirmBlockOverlay
                show={isConfirmingBlock}
                isIgnored={isIgnored}
                confirming={isBlockingUser}
                onConfirm={isIgnored ? unblockUser : blockUser}
                onDismiss={() => setIsConfirmingBlock(false)}
                user={{
                    id: room.directUserId ?? '',
                    displayName: '', //  room?.preview?.displayName ?? '',
                    avatarUrl: '', // room?.preview?.avatarUrl ?? '',
                }}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'space-evenly',
            padding: theme.spacing.lg,
        },
        settingsItems: {
            backgroundColor: theme.colors.offWhite100,
            borderRadius: theme.borders.settingsRadius,
            padding: theme.spacing.xs,
        },
        content: {
            height: '100%',
        },
        switch: {
            position: 'absolute',
            right: theme.spacing.sm,
        },
    })

export default RoomSettings
