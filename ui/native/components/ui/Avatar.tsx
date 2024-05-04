import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'

import stringUtils from '@fedi/common/utils/StringUtils'
import { getIdentityColors } from '@fedi/common/utils/color'

import SvgImage, {
    SvgImageName,
    SvgImageSize,
    getIconSizeMultiplier,
} from './SvgImage'

export enum AvatarSize {
    sm = 'sm',
    md = 'md',
    lg = 'lg',
}

const svgImageSizeMapping = {
    [AvatarSize.sm]: SvgImageSize.xs,
    [AvatarSize.md]: SvgImageSize.sm,
    [AvatarSize.lg]: SvgImageSize.md,
}

type HoloAvatarProps = {
    size?: AvatarSize
    id: string | number
    name: string
    icon?: SvgImageName
}

const Avatar: React.FC<HoloAvatarProps> = ({
    size = AvatarSize.sm,
    id,
    name,
    icon,
}: HoloAvatarProps) => {
    const { theme } = useTheme()
    const [bgColor, textColor] = getIdentityColors(id)
    const { fontScale } = useWindowDimensions()

    const customSize =
        size === AvatarSize.sm
            ? theme.sizes.smallAvatar
            : size === AvatarSize.md
            ? theme.sizes.mediumAvatar
            : theme.sizes.largeAvatar
    const pxSize = getIconSizeMultiplier(fontScale) * customSize
    const mergedContainerStyle = [
        styles.container,
        {
            height: pxSize,
            width: pxSize,
            borderRadius: pxSize * 0.5,
        },
        { backgroundColor: bgColor },
    ]
    const mergedTextStyle = [styles.text, { color: textColor }]

    return (
        <View style={mergedContainerStyle}>
            {icon ? (
                <SvgImage
                    name={icon}
                    size={svgImageSizeMapping[size]}
                    color={textColor}
                />
            ) : (
                <Text
                    bold
                    tiny={size === AvatarSize.sm}
                    h2={size === AvatarSize.lg}
                    style={mergedTextStyle}>
                    {stringUtils.getInitialsFromName(name)}
                </Text>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        position: 'absolute',
    },
})

export default Avatar
