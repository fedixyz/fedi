import { Theme, useTheme } from '@rneui/themed'
import { StyleSheet, useWindowDimensions, View } from 'react-native'

import { AvatarSize } from './Avatar'
import Flex from './Flex'
import { getIconSizeMultiplier } from './SvgImage'

function AvatarStack<T>({
    size = AvatarSize.sm,
    stackDirection = 'ltr',
    maxFontSizeMultiplier,
    data,
    renderAvatar,
}: {
    size?: AvatarSize
    stackDirection?: 'ltr' | 'rtl'
    maxFontSizeMultiplier?: number
    data: Array<T>
    renderAvatar: (item: T, size: number) => React.ReactNode
}) {
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
                    width: sizePx + (data.length - 1) * (sizePx / 2),
                    height: sizePx,
                },
            ]}>
            {data.map((item, i) => (
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
                        stackDirection === 'rtl' && { zIndex: data.length - i },
                    ]}>
                    {renderAvatar(item, sizePx)}
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
