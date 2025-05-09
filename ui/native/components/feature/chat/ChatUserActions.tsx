import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    banUser,
    ignoreUser,
    kickUser,
    selectMatrixAuth,
    selectMatrixRoomSelfPowerLevel,
    setMatrixRoomMemberPowerLevel,
    unignoreUser,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { matrixIdToUsername } from '@fedi/common/utils/matrix'
import SvgImage, { SvgImageName } from '@fedi/native/components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '@fedi/native/state/hooks'

import ChatAction from './ChatAction'
import { ConfirmBlockOverlay } from './ConfirmBlockOverlay'

export type Props = {
    roomId: string
    member: MatrixRoomMember
    dismiss: () => void
}

type Action = {
    id: number
    label: string
    icon: SvgImageName
    onPress: () => void
    red?: boolean
    hideArrow?: boolean
}
type RoleChangeAction = Action & {
    powerLevel: MatrixPowerLevel
}

type ModerationAction = Action & {
    reason?: string
}

const log = makeLog('chat/ChatUserActions')

const ChatUserActions: React.FC<Props> = ({
    roomId,
    member,
    dismiss,
}: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const myUserId = useAppSelector(selectMatrixAuth)?.userId
    const myPowerLevel = useAppSelector(s =>
        selectMatrixRoomSelfPowerLevel(s, roomId),
    )
    const navigation = useNavigation()
    const dispatch = useAppDispatch()
    const { error, show } = useToast()
    const [loadingAction, setLoadingAction] = useState<number | null>(null)

    const [isConfirmingBlock, setIsConfirmingBlock] = useState(false)
    const [isBlockingUser, setIsBlockingUser] = useState(false)

    const handleBlockUser = useCallback(async () => {
        setIsBlockingUser(true)
        try {
            // unblock if already blocked
            if (member.ignored) {
                await dispatch(
                    unignoreUser({ userId: member.id, roomId }),
                ).unwrap()
                show({
                    content: t('feature.chat.unblock-user-success'),
                    status: 'success',
                })
            } else {
                await dispatch(
                    ignoreUser({ userId: member.id, roomId }),
                ).unwrap()
                show({
                    content: t('feature.chat.block-user-success'),
                    status: 'success',
                })
            }
        } catch (err) {
            log.error('Failed to ignore user', err)
            error(t, 'feature.chat.block-user-failure')
        }
        setIsBlockingUser(false)
        dismiss()
    }, [dispatch, member.id, show, t, dismiss, error, roomId, member.ignored])

    const handleChangePowerLevel = async (
        userId: string,
        powerLevel: MatrixPowerLevel,
        actionId: number,
    ) => {
        setLoadingAction(actionId)
        try {
            await dispatch(
                setMatrixRoomMemberPowerLevel({ roomId, userId, powerLevel }),
            ).unwrap()
            log.info(`Updated user's power level to ${powerLevel}`)
            show({
                content: t('feature.chat.change-role-success'),
                status: 'success',
            })
        } catch (err) {
            log.error("Failed to update user's power level", err)
            error(t, 'feature.chat.change-role-failure')
        }
        setLoadingAction(null)
        dismiss()
    }

    const getRoleDisabled = (
        roomMember: MatrixRoomMember,
        powerLevel?: MatrixPowerLevel,
    ) => {
        if (!myUserId) return true
        // Cannot change your own role
        if (roomMember.id === myUserId) return true
        // Cannot lower the role of a member with the same or greater role
        if (myPowerLevel <= roomMember.powerLevel) return true

        // Cannot assign a role higher than your role
        if (powerLevel && myPowerLevel < powerLevel) return true
        // Cannot set the role to the current role
        if (powerLevel && roomMember.powerLevel === powerLevel) return true
        return false
    }

    const actions: Action[] = [
        {
            id: 0,
            label: t('feature.chat.go-to-direct-chat'),
            icon: 'Chat',
            onPress: () => {
                navigation.navigate('ChatUserConversation', {
                    userId: member.id,
                    displayName:
                        member.displayName ?? matrixIdToUsername(member.id),
                })
                dismiss()
            },
        },
        {
            id: 1,
            label: member.ignored
                ? t('feature.chat.unblock-user')
                : t('feature.chat.block-user'),
            icon: 'BlockMember',
            red: true,
            hideArrow: true,
            onPress: () => {
                setIsConfirmingBlock(true)
            },
        },
    ]

    const handleRemoveUser = async (
        userId: string,
        actionId: number,
        reason?: string,
    ) => {
        setLoadingAction(actionId)
        try {
            log.info(`removing user ${userId} from room ${roomId}`)
            await dispatch(kickUser({ roomId, userId, reason })).unwrap()
            show({
                content: t('feature.chat.user-remove-success'),
                status: 'success',
            })
        } catch (err) {
            log.error('Failed to remove user from room', err)
            error(t, 'feature.errors.failed-to-remove-user')
        }
        setLoadingAction(null)
        dismiss()
    }

    const handleBanUser = async (
        userId: string,
        actionId: number,
        reason?: string,
    ) => {
        setLoadingAction(actionId)
        try {
            log.info(`Banning user ${userId} from room ${roomId}`)
            await dispatch(banUser({ roomId, userId, reason })).unwrap()
            show({
                content: t('feature.chat.user-ban-success'),
                status: 'success',
            })
        } catch (err) {
            log.error('Failed to ban user from room', err)
            error(t, 'feature.errors.failed-to-ban-user')
        }
        setLoadingAction(null)
        dismiss()
    }

    const changeRoles: RoleChangeAction[] = [
        {
            id: 2,
            label: t('words.member'),
            powerLevel: MatrixPowerLevel.Member,
            icon: 'User',
            onPress: () =>
                handleChangePowerLevel(member.id, MatrixPowerLevel.Member, 1),
        },
        {
            id: 3,
            label: t('words.moderator'),
            powerLevel: MatrixPowerLevel.Moderator,
            icon: 'ChatModerator',
            onPress: () =>
                handleChangePowerLevel(
                    member.id,
                    MatrixPowerLevel.Moderator,
                    2,
                ),
        },
        {
            id: 4,
            label: t('words.admin'),
            powerLevel: MatrixPowerLevel.Admin,
            icon: 'ChatAdmin',
            onPress: () =>
                handleChangePowerLevel(member.id, MatrixPowerLevel.Admin, 3),
        },
    ]

    const moderationActions: ModerationAction[] = [
        {
            id: 5,
            label: t('feature.chat.remove-user'),
            icon: 'KickMember',
            onPress: () => handleRemoveUser(member.id, 4),
        },
        {
            id: 6,
            label: t('feature.chat.ban-user'),
            icon: 'BlockMember',
            onPress: () => handleBanUser(member.id, 5),
        },
        // TODO: Block from this screen?
        // TODO: Temporary Mute?
        // {
        //     id: 6,
        //     label: t('words.admin'),
        //     icon: 'ChatAdmin',
        //     onPress: () =>
        //         handleChangePowerLevel(member.id, MatrixPowerLevel.Admin),
        // },
    ]

    const getColor = (action: RoleChangeAction) =>
        member.powerLevel === action.powerLevel ? theme.colors.blue : undefined

    return (
        <View style={styles(theme).container}>
            <View style={styles(theme).sectionContainer}>
                <Text caption style={styles(theme).sectionTitle}>
                    {t('words.actions')}
                </Text>
                {actions.map(action => (
                    <ChatAction
                        key={action.id}
                        leftIcon={
                            <SvgImage
                                name={action.icon}
                                color={
                                    action.red ? theme.colors.red : undefined
                                }
                            />
                        }
                        rightIcon={
                            !action.hideArrow && (
                                <SvgImage name={'ChevronRight'} />
                            )
                        }
                        label={action.label}
                        labelColor={action.red ? theme.colors.red : undefined}
                        onPress={() => action.onPress()}
                    />
                ))}
            </View>
            {/* Only show roles if the user is an admin */}
            {myPowerLevel >= MatrixPowerLevel.Moderator && (
                <>
                    <View style={styles(theme).sectionContainer}>
                        <Text caption style={styles(theme).sectionTitle}>
                            {t('feature.chat.change-role')}
                        </Text>
                        {changeRoles.map(action => (
                            <ChatAction
                                key={action.id}
                                leftIcon={
                                    <SvgImage
                                        name={action.icon}
                                        color={getColor(action)}
                                    />
                                }
                                rightIcon={
                                    member.powerLevel === action.powerLevel && (
                                        <SvgImage
                                            name={'Check'}
                                            color={getColor(action)}
                                        />
                                    )
                                }
                                label={action.label}
                                onPress={() => action.onPress()}
                                disabled={getRoleDisabled(
                                    member,
                                    action.powerLevel,
                                )}
                                active={action.powerLevel === member.powerLevel}
                                isLoading={loadingAction === action.id}
                            />
                        ))}
                    </View>
                </>
            )}
            {/* Only show roles if the user is an admin */}
            {myPowerLevel >= MatrixPowerLevel.Moderator && (
                <>
                    <View style={styles(theme).sectionContainer}>
                        <Text caption style={styles(theme).sectionTitle}>
                            {t('phrases.moderation-tools')}
                        </Text>
                        {moderationActions.map(action => (
                            <ChatAction
                                key={action.id}
                                leftIcon={
                                    <SvgImage
                                        name={action.icon}
                                        color={theme.colors.red}
                                    />
                                }
                                label={action.label}
                                labelColor={theme.colors.red}
                                onPress={() => action.onPress()}
                                disabled={getRoleDisabled(member)}
                                isLoading={loadingAction === action.id}
                            />
                        ))}
                    </View>
                </>
            )}
            <ConfirmBlockOverlay
                show={isConfirmingBlock}
                confirming={isBlockingUser}
                onConfirm={() => handleBlockUser()}
                onDismiss={() => setIsConfirmingBlock(false)}
                user={{
                    id: member.id,
                    displayName: member.displayName,
                    avatarUrl: member.avatarUrl,
                }}
                isIgnored={member.ignored}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'space-evenly',
            alignItems: 'center',
            padding: theme.spacing.lg,
            paddingTop: 0,
        },
        profileHeader: {
            alignItems: 'center',
            padding: theme.spacing.lg,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.primaryLight,
        },
        actionsContainer: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignSelf: 'flex-start',
        },
        sectionContainer: {
            flexDirection: 'column',
            alignItems: 'flex-start',
        },
        sectionTitle: {
            color: theme.colors.primaryLight,
            paddingVertical: theme.spacing.sm,
        },
        versionContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.offWhite,
            padding: theme.spacing.md,
            borderRadius: theme.borders.defaultRadius,
            marginTop: theme.spacing.md,
        },
        logo: {
            marginBottom: theme.spacing.sm,
        },
    })

export default ChatUserActions
