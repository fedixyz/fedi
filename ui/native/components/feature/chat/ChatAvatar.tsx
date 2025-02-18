import { useTheme } from '@rneui/themed'
import React from 'react'

import {
    MatrixAuth,
    MatrixRoom,
    MatrixRoomMember,
    MatrixUser,
} from '@fedi/common/types'
import { matrixIdToUsername } from '@fedi/common/utils/matrix'

import Avatar, { AvatarProps } from '../../ui/Avatar'

type BaseProps = Omit<AvatarProps, 'id' | 'name' | 'icon'>
type RoomProps = BaseProps & {
    room: Pick<
        MatrixRoom,
        'id' | 'name' | 'broadcastOnly' | 'avatarUrl' | 'directUserId'
    >
}
type UserProps = BaseProps & {
    user: Pick<MatrixUser, 'id' | 'displayName' | 'avatarUrl'> & {
        membership?: MatrixRoomMember['membership']
    }
}
export const matrixAuthToAvatarProps = (
    matrixAuth: MatrixAuth,
): ChatAvatarProps => ({
    user: {
        ...matrixAuth,
        id: matrixAuth?.userId,
    },
})

export type ChatAvatarProps =
    | RoomProps
    | (UserProps & { maxFontSizeMultiplier?: number })

const ChatAvatar: React.FC<ChatAvatarProps> = props => {
    const { theme } = useTheme()
    let id: string | undefined
    let name: string | undefined
    let icon: AvatarProps['icon'] | undefined
    let src: string | undefined
    let avatarProps: BaseProps
    if ('room' in props) {
        const { room, ...rest } = props
        id = room.directUserId || room.id
        name = room.name
        icon = room.directUserId
            ? undefined
            : room.broadcastOnly
              ? 'SpeakerPhone'
              : 'SocialPeople'
        src = room.avatarUrl
        avatarProps = rest
    } else {
        const { user, ...rest } = props
        id = user.id
        name = user.displayName || matrixIdToUsername(user.id)
        if (user.membership) {
            icon = user.membership === 'join' ? undefined : 'User'
        }
        src = user.avatarUrl
        avatarProps = rest
    }

    const maxFontSizeMultiplier =
        props.maxFontSizeMultiplier ||
        theme.multipliers.defaultMaxFontMultiplier

    return (
        <Avatar
            id={id || ''}
            name={name || '?'}
            icon={icon}
            url={src}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            {...avatarProps}
        />
    )
}

export default ChatAvatar
