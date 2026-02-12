import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import EditIcon from '@fedi/common/assets/svgs/edit.svg'
import LeaveRoomIcon from '@fedi/common/assets/svgs/leave-room.svg'
import RoomIcon from '@fedi/common/assets/svgs/room.svg'
import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import SpeakerPhoneIcon from '@fedi/common/assets/svgs/speakerphone.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    leaveMatrixRoom,
    selectIsDefaultGroup,
    selectMatrixRoomSelfPowerLevel,
    setMatrixRoomBroadcastOnly,
    setMatrixRoomName,
} from '@fedi/common/redux'
import { MatrixPowerLevel, MatrixRoom } from '@fedi/common/types'
import { isPowerLevelGreaterOrEqual } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'
import { Dialog } from '../Dialog'
import { SettingsMenu, SettingsMenuProps } from '../SettingsMenu'
import { Switch } from '../Switch'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'
import { ChatRoomInviteUser } from './ChatRoomInviteUser'
import { ChatRoomMembersList } from './ChatRoomMembersList'

interface Props {
    room: MatrixRoom
    open: boolean
    onOpenChange(open: boolean): void
}

export const ChatRoomSettingsDialog: React.FC<Props> = ({
    room,
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { replace } = useRouter()
    const myPowerLevel = useAppSelector(s =>
        selectMatrixRoomSelfPowerLevel(s, room.id),
    )
    const [page, setPage] = useState<
        'index' | 'members' | 'invite' | 'admins' | 'add-admin'
    >('index') // TODO: Use router instead of state
    const [isTogglingBroadcastOnly, setIsTogglingBroadcastOnly] =
        useState(false)
    const { error } = useToast()

    const isAdmin =
        myPowerLevel &&
        isPowerLevelGreaterOrEqual(myPowerLevel, MatrixPowerLevel.Admin)
    const isModerator =
        myPowerLevel &&
        isPowerLevelGreaterOrEqual(myPowerLevel, MatrixPowerLevel.Moderator)
    const isDefaultGroup = useAppSelector(s =>
        selectIsDefaultGroup(s, room?.id || ''),
    )

    useEffect(() => {
        if (open) return
        setPage('index')
    }, [open])

    const handleEditRoomName = useCallback(async () => {
        try {
            const newName = prompt(t('feature.chat.change-group-name'))
            if (!newName) return
            await dispatch(
                setMatrixRoomName({
                    fedimint,
                    roomId: room.id,
                    name: newName,
                }),
            ).unwrap()
            onOpenChange(false)
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
    }, [t, dispatch, room.id, onOpenChange, error])

    const handleLeaveRoom = useCallback(async () => {
        const shouldLeave = confirm(t('feature.chat.leave-group-confirmation'))
        if (!shouldLeave) return
        try {
            await dispatch(
                leaveMatrixRoom({ fedimint, roomId: room.id }),
            ).unwrap()
            replace('/chat')
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
    }, [t, dispatch, room.id, replace, error])

    const handleToggleBroadcastOnly = useCallback(async () => {
        if (isTogglingBroadcastOnly) return
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
            error(t, 'errors.unknown-error')
        }
        setIsTogglingBroadcastOnly(false)
    }, [
        isTogglingBroadcastOnly,
        dispatch,
        room.id,
        room.broadcastOnly,
        error,
        t,
    ])

    let content: React.ReactNode
    let title: string | undefined
    if (page === 'index') {
        title = t('feature.chat.chat-settings')
        const menu: SettingsMenuProps['menu'] = [
            {
                label: t('words.group'),
                items: [
                    {
                        label: t('words.members'),
                        icon: SocialPeopleIcon,
                        onClick: () => setPage('members'),
                        hidden: isDefaultGroup,
                    },
                    {
                        label: t('feature.chat.invite-to-group'),
                        icon: RoomIcon,
                        onClick: () => setPage('invite'),
                        disabled: !isAdmin && !isModerator,
                    },
                    {
                        label: t('feature.chat.leave-group'),
                        icon: LeaveRoomIcon,
                        onClick: handleLeaveRoom,
                        disabled: isDefaultGroup,
                    },
                    {
                        label: t('feature.chat.change-group-name'),
                        icon: EditIcon,
                        onClick: handleEditRoomName,
                        disabled: !isAdmin,
                    },
                    {
                        label: t('feature.chat.broadcast-only'),
                        icon: SpeakerPhoneIcon,
                        action: (
                            <Switch
                                checked={!!room.broadcastOnly}
                                disabled={isTogglingBroadcastOnly || !isAdmin}
                            />
                        ),
                        // TODO: check actual power level requirement instead of hardcoding admin?
                        disabled: !isAdmin,
                        onClick: handleToggleBroadcastOnly,
                    },
                ],
            },
        ]

        content = (
            <>
                <RoomInfo>
                    <ChatAvatar room={room} size="lg" />
                    <Text variant="h2" weight="normal">
                        {room.name}
                    </Text>
                </RoomInfo>
                <SettingsMenu menu={menu} />
            </>
        )
    } else if (page === 'members') {
        title = t('words.members')
        content = <ChatRoomMembersList roomId={room.id} />
    } else if (page === 'invite') {
        title = t('feature.chat.invite-to-group')
        content = <ChatRoomInviteUser roomId={room.id} />
    } else if (page === 'admins') {
        title = t('feature.chat.broadcast-admin-settings')
        content = 'TODO: Add admin settings here.'
    } else if (page === 'add-admin') {
        title = t('feature.chat.add-admin')
        content = 'TODO: Add admin here.'
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange} title={title}>
            {content}
        </Dialog>
    )
}

const RoomInfo = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    gap: 12,
    padding: 12,
})
