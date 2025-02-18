import { Image, Text, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import {
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
    useWindowDimensions,
} from 'react-native'

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

export type AvatarProps = {
    size?: AvatarSize
    id: string | number
    url?: string
    name?: string
    icon?: SvgImageName
    containerStyle?: StyleProp<ViewStyle>
    maxFontSizeMultiplier?: number
}

const Avatar: React.FC<AvatarProps> = ({
    size = AvatarSize.sm,
    id,
    name,
    icon,
    url,
    containerStyle,
    maxFontSizeMultiplier,
}: AvatarProps) => {
    const { theme } = useTheme()
    const [bgColor, textColor] = getIdentityColors(id)
    const [isFallback, setIsFallback] = useState(!url)
    const { fontScale } = useWindowDimensions()

    const customSize =
        size === AvatarSize.sm
            ? theme.sizes.smallAvatar
            : size === AvatarSize.md
              ? theme.sizes.mediumAvatar
              : theme.sizes.largeAvatar

    const multiplier = getIconSizeMultiplier(
        Math.min(fontScale, maxFontSizeMultiplier || Infinity),
    )
    const pxSize = multiplier * customSize
    const mergedContainerStyle = [
        styles.container,
        {
            height: pxSize,
            width: pxSize,
            borderRadius: pxSize * 0.5,
        },
        { backgroundColor: bgColor },
        containerStyle,
    ]
    const mergedTextStyle = [styles.text, { color: textColor }]
    const imageStyle = [styles.image, { borderRadius: pxSize * 0.5 }]

    return (
        <View style={mergedContainerStyle}>
            {/*
                Defaults to the image url if provided.
                Then falls back to a provided icon.
                then falls back to initials.
            */}
            {!isFallback && url ? (
                <Image
                    containerStyle={imageStyle}
                    resizeMode="cover"
                    source={{ uri: url }}
                    onError={() => setIsFallback(true)}
                />
            ) : icon ? (
                <SvgImage
                    name={icon}
                    size={svgImageSizeMapping[size]}
                    color={textColor}
                />
            ) : (
                <Text
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={multiplier}
                    bold
                    tiny={size === AvatarSize.sm}
                    h2={size === AvatarSize.lg}
                    style={mergedTextStyle}>
                    {name ? stringUtils.getInitialsFromName(name) : ''}
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
    image: {
        height: '100%',
        width: '100%',
    },
})

export default Avatar
