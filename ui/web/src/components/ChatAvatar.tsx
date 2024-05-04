import React from 'react'

import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import SpeakerphoneIcon from '@fedi/common/assets/svgs/speakerphone.svg'
import { Chat } from '@fedi/common/types'

import { Avatar, AvatarProps } from './Avatar'

interface Props extends Omit<AvatarProps, 'id' | 'name' | 'icon'> {
    chat:
        | Pick<Chat, 'id' | 'name' | 'type' | 'broadcastOnly'>
        | undefined
        | null
}

export const ChatAvatar: React.FC<Props> = ({ chat, ...props }) => {
    let icon: typeof SocialPeopleIcon | undefined
    if (chat?.type === 'group') {
        icon = chat.broadcastOnly ? SpeakerphoneIcon : SocialPeopleIcon
    }

    return (
        <Avatar
            id={chat?.id || ''}
            name={chat?.name || '?'}
            icon={icon}
            {...props}
        />
    )
}
