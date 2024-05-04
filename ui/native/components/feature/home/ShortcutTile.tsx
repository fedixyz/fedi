import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import {
    Image,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'

import { FediMod, Shortcut } from '../../../types'
import SvgImage, {
    SvgImageName,
    SvgImageSize,
    getIconSizeMultiplier,
} from '../../ui/SvgImage'

type ShortcutTileProps = {
    shortcut: Shortcut
    onSelect: (shortcut: Shortcut) => void
}

const ShortcutTile = ({ shortcut, onSelect }: ShortcutTileProps) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()

    const style = styles(theme, fontScale)

    const renderIcon = () => {
        if ((shortcut as FediMod).imageUrl) {
            return (
                <Image
                    style={style.iconImage}
                    source={{ uri: (shortcut as FediMod).imageUrl }}
                    resizeMode="contain"
                />
            )
        } else if (shortcut.icon.image) {
            return (
                <Image
                    style={style.iconImage}
                    source={shortcut.icon.image}
                    resizeMode="contain"
                />
            )
        } else if (shortcut.icon.svg) {
            return (
                <SvgImage
                    containerStyle={style.iconSvg}
                    name={shortcut.icon.svg as SvgImageName}
                    size={SvgImageSize.md}
                    color={theme.colors.secondary}
                />
            )
        }
    }

    return (
        <Pressable style={style.container} onPress={() => onSelect(shortcut)}>
            <View>{renderIcon()}</View>
            <View style={style.title}>
                <Text caption medium numberOfLines={2} style={style.titleText}>
                    {shortcut.title}
                </Text>
            </View>
        </Pressable>
    )
}

const styles = (theme: Theme, fontScale: number) => {
    const iconSize = theme.sizes.lg * getIconSizeMultiplier(fontScale)
    return StyleSheet.create({
        container: {
            alignItems: 'center',
            width: '100%',
            marginVertical: theme.spacing.md,
        },
        iconImage: {
            width: iconSize,
            height: iconSize,
            overflow: 'hidden',
            borderRadius: theme.borders.fediModTileRadius,
            marginBottom: theme.spacing.xs,
        },
        iconSvg: {
            width: iconSize,
            height: iconSize,
            borderRadius: theme.borders.fediModTileRadius,
            backgroundColor: theme.colors.primary,
            marginBottom: theme.spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
        },
        title: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingBottom: theme.spacing.xs,
            paddingHorizontal: theme.spacing.xs,
        },
        titleText: {
            textAlign: 'center',
            lineHeight: 20,
        },
    })
}

export default ShortcutTile
