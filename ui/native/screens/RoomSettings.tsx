import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    leaveMatrixRoom,
    selectDefaultMatrixRoomIds,
    selectMatrixRoom,
    selectMatrixRoomMembersCount,
    selectMatrixRoomSelfPowerLevel,
    setMatrixRoomBroadcastOnly,
} from '@fedi/common/redux'
import { MatrixPowerLevel } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { ChatSettingsAvatar } from '../components/feature/chat/ChatSettingsAvatar'
import SettingsItem, {
    SettingsItemProps,
} from '../components/feature/settings/SettingsItem'
import HoloLoader from '../components/ui/HoloLoader'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'RoomSettings'>

const RoomSettings: React.FC<Props> = ({ navigation, route }: Props) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const { roomId } = route.params
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const memberCount = useAppSelector(s =>
        selectMatrixRoomMembersCount(s, roomId),
    )
    const myPowerLevel = useAppSelector(s =>
        selectMatrixRoomSelfPowerLevel(s, room?.id || ''),
    )
    const isAdmin = myPowerLevel >= MatrixPowerLevel.Admin
    const isDefaultGroup = useAppSelector(s =>
        selectDefaultMatrixRoomIds(s).includes(room?.id || ''),
    )
    const isGroupChat = room?.directUserId === undefined
    const [isTogglingBroadcastOnly, setIsTogglingBroadcastOnly] =
        useState(false)

    const leaveChat = useCallback(async () => {
        // Immediately navigate and replace navigation stack on leave
        // attempt, otherwise pressing the back button or useEffects in
        // backgrounded screens may attempt to re-join the group right
        // after we leave it.
        try {
            navigation.replace('TabsNavigator')
            await dispatch(leaveMatrixRoom({ roomId })).unwrap()
        } catch (err) {
            toast.error(t, err)
        }
    }, [dispatch, navigation, roomId, t, toast])

    const handleLeaveChat = useCallback(() => {
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
    }, [isGroupChat, leaveChat, t])

    const handleChangeGroupName = useCallback(() => {
        navigation.navigate('EditGroup', { roomId })
    }, [navigation, roomId])

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
        setIsTogglingBroadcastOnly(true)
        try {
            await dispatch(
                setMatrixRoomBroadcastOnly({
                    roomId: room.id,
                    broadcastOnly: !room.broadcastOnly,
                }),
            ).unwrap()
        } catch (err) {
            toast.error(t, 'errors.unknown-error')
        }
        setIsTogglingBroadcastOnly(false)
    }, [isDefaultGroup, isTogglingBroadcastOnly, room, dispatch, toast, t])

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
        } else {
            items.push({
                icon: 'LeaveRoom',
                label: t('feature.chat.leave-chat'),
                onPress: handleLeaveChat,
            })
        }
        return items
    }, [
        handleChangeGroupName,
        handleInviteMember,
        handleLeaveChat,
        handleToggleBroadcastOnly,
        handleViewMembers,
        isAdmin,
        isDefaultGroup,
        isGroupChat,
        isTogglingBroadcastOnly,
        memberCount,
        room?.broadcastOnly,
        style.switch,
        t,
    ])

    if (!room) return <HoloLoader />

    return (
        <View style={style.container}>
            <ChatSettingsAvatar room={room} />
            <ScrollView bounces={false} contentContainerStyle={style.content}>
                <View style={style.sectionContainer}>
                    <Text color={theme.colors.primaryLight}>
                        {t('feature.chat.chat-settings')}
                    </Text>
                    <View style={style.settingsItems}>
                        {settingsItems.map((item, index) => (
                            <SettingsItem key={`si-${index}`} {...item} />
                        ))}
                    </View>
                </View>
            </ScrollView>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'space-evenly',
            padding: theme.spacing.lg,
        },
        sectionContainer: {
            gap: theme.spacing.lg,
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
