import { Image, Text, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import {
    StyleProp,
    StyleSheet,
    ViewStyle,
    useWindowDimensions,
} from 'react-native'

import stringUtils from '@fedi/common/utils/StringUtils'
import { getIdentityColors } from '@fedi/common/utils/color'

import Flex from './Flex'
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
    isBlocked?: boolean
}

const Avatar: React.FC<AvatarProps> = ({
    size = AvatarSize.sm,
    id,
    name,
    icon,
    url,
    containerStyle,
    maxFontSizeMultiplier,
    isBlocked,
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
        { backgroundColor: isBlocked ? theme.colors.lightGrey : bgColor },
        containerStyle,
    ]
    const mergedTextStyle = [styles.text, { color: textColor }]
    const imageStyle = [styles.image, { borderRadius: pxSize * 0.5 }]

    useEffect(() => {
        setIsFallback(false)
    }, [url])

    return (
        <Flex center style={mergedContainerStyle}>
            {/*
                Defaults to the image url if provided.
                Then falls back to a provided icon.
                then falls back to initials.
            */}
            {isBlocked ? (
                <></>
            ) : !isFallback && url ? (
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
        </Flex>
    )
}

const styles = StyleSheet.create({
    container: {
        position: 'relative',
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
