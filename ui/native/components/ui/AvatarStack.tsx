import { Theme, useTheme } from '@rneui/themed'
import { StyleSheet, useWindowDimensions, View } from 'react-native'

import { MatrixRoomMember } from '../../types'
import ChatAvatar from '../feature/chat/ChatAvatar'
import { AvatarSize } from './Avatar'
import Flex from './Flex'
import { getIconSizeMultiplier } from './SvgImage'

const AvatarStack: React.FC<{
    members: MatrixRoomMember[]
    size?: AvatarSize
    maxFontSizeMultiplier?: number
}> = ({ members, size = AvatarSize.sm, maxFontSizeMultiplier }) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()
    const style = styles(theme)

    const customSize =
        size === AvatarSize.sm
            ? theme.sizes.smallAvatar
            : size === AvatarSize.md
              ? theme.sizes.mediumAvatar
              : theme.sizes.largeAvatar

    const multiplier = getIconSizeMultiplier(
        Math.min(fontScale, maxFontSizeMultiplier ?? Infinity),
    )
    const sizePx = multiplier * customSize

    return (
        <View
            style={[
                style.container,
                {
                    width: sizePx + (members.length - 1) * (sizePx / 2),
                    height: sizePx,
                },
            ]}>
            {members.map((member, i) => (
                <Flex
                    center
                    key={`avatar-stack-${i}`}
                    style={[
                        style.avatar,
                        {
                            left: (i * sizePx) / 2,
                            width: sizePx,
                            height: sizePx,
                            borderRadius: sizePx / 2,
                        },
                    ]}>
                    <ChatAvatar user={member} size={size} />
                </Flex>
            ))}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'relative',
        },
        avatar: {
            position: 'absolute',
            top: 0,
            borderWidth: 1,
            borderColor: theme.colors.white,
            overflow: 'hidden',
            backgroundColor: theme.colors.red,
        },
    })

export default AvatarStack
