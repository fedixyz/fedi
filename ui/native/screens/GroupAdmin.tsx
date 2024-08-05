import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
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

import SettingsItem from '../components/feature/admin/SettingsItem'
import { ChatSettingsAvatar } from '../components/feature/chat/ChatSettingsAvatar'
import HoloLoader from '../components/ui/HoloLoader'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'GroupAdmin'>

const GroupAdmin: React.FC<Props> = ({ navigation, route }: Props) => {
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
    const [isTogglingBroadcastOnly, setIsTogglingBroadcastOnly] =
        useState(false)

    const leaveGroup = useCallback(async () => {
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

    const handleLeaveGroup = useCallback(() => {
        Alert.alert(
            t('feature.chat.leave-group'),
            t('feature.chat.leave-group-confirmation'),
            [
                {
                    text: t('words.cancel'),
                },
                {
                    text: t('words.yes'),
                    onPress: () => leaveGroup(),
                },
            ],
        )
    }, [leaveGroup, t])

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

    if (!room) return <HoloLoader />

    return (
        <View style={styles(theme).container}>
            <ChatSettingsAvatar room={room} />
            <ScrollView
                bounces={false}
                contentContainerStyle={styles(theme).content}>
                <View style={styles(theme).sectionContainer}>
                    <Text style={styles(theme).sectionTitle}>
                        {t('feature.chat.chat-settings')}
                    </Text>
                    {(!isDefaultGroup || (isDefaultGroup && isAdmin)) && (
                        <SettingsItem
                            image={<SvgImage name="SocialPeople" />}
                            label={`${amountUtils.formatNumber(
                                memberCount,
                            )} ${t('words.members')}`}
                            onPress={handleViewMembers}
                        />
                    )}
                    <SettingsItem
                        image={<SvgImage name="Room" />}
                        label={t('feature.chat.invite-to-group')}
                        onPress={handleInviteMember}
                        disabled={!isAdmin}
                    />
                    <SettingsItem
                        image={<SvgImage name="LeaveRoom" />}
                        label={t('feature.chat.leave-group')}
                        onPress={handleLeaveGroup}
                    />
                    <SettingsItem
                        image={<SvgImage name="Edit" />}
                        label={t('feature.chat.change-group-name')}
                        onPress={handleChangeGroupName}
                        disabled={!isAdmin}
                    />
                    <SettingsItem
                        image={<SvgImage name="SpeakerPhone" />}
                        label={t('feature.chat.broadcast-only')}
                        action={
                            <Switch
                                style={styles(theme).switch}
                                value={room?.broadcastOnly}
                                disabled={isTogglingBroadcastOnly || !isAdmin}
                                onValueChange={_ => {
                                    handleToggleBroadcastOnly()
                                }}
                            />
                        }
                        isLoading={isTogglingBroadcastOnly}
                        disabled={!isAdmin}
                        onPress={handleToggleBroadcastOnly}
                    />
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
            flexDirection: 'column',
            alignItems: 'flex-start',
        },
        sectionTitle: {
            color: theme.colors.primaryLight,
            paddingVertical: theme.spacing.sm,
        },
        content: {
            height: '100%',
        },
        switch: {
            position: 'absolute',
            right: theme.spacing.sm,
        },
    })

export default GroupAdmin
