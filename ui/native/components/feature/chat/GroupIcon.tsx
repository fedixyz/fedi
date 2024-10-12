import { ChatGroup } from '@fedi/common/types'

import Avatar, { AvatarSize } from '../../ui/Avatar'

type GroupIconProps = {
    chat: Pick<ChatGroup, 'id' | 'name' | 'broadcastOnly'>
    size?: AvatarSize
}

const GroupIcon = ({ chat, size = AvatarSize.md }: GroupIconProps) => {
    const defaultGroupIcon = chat.broadcastOnly
        ? 'SpeakerPhone'
        : 'SocialPeople'

    return (
        <Avatar
            id={chat.id}
            name={chat.name || ''}
            icon={defaultGroupIcon}
            size={size}
        />
    )
}

export default GroupIcon
