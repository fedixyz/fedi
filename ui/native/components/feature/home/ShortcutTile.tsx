import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import {
    Image,
    ImageSourcePropType,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'

import { selectIsActiveFederationRecovering } from '@fedi/common/redux'

import { FediModImages } from '../../../assets/images'
import { useAppSelector } from '../../../state/hooks'
import { FediMod, Shortcut, ShortcutType } from '../../../types'
import { BubbleView } from '../../ui/BubbleView'
import { Pressable } from '../../ui/Pressable'
import SvgImage, {
    SvgImageName,
    SvgImageSize,
    getIconSizeMultiplier,
} from '../../ui/SvgImage'

type ShortcutTileProps = {
    shortcut: Shortcut
    onHold?: (shortcut: Shortcut) => void
    onSelect: (shortcut: Shortcut) => void
}

function isMod(shortcut: Shortcut | FediMod): shortcut is FediMod {
    return shortcut.type === ShortcutType.fediMod
}

const ShortcutTile = ({ shortcut, onHold, onSelect }: ShortcutTileProps) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()
    const [imageSrc, setImageSrc] = useState<ImageSourcePropType | undefined>(
        undefined,
    )

    useEffect(() => {
        if (isMod(shortcut)) {
            // use local image if we have it
            if (FediModImages[shortcut.id]) {
                setImageSrc(FediModImages[shortcut.id])
            } else if (shortcut.imageUrl) {
                // then try image url
                setImageSrc({ uri: shortcut.imageUrl })
            } else {
                // fallback to default
                setImageSrc(FediModImages.default)
            }
        }
    }, [shortcut])

    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )

    const multiplier = Math.min(fontScale, 2)

    const style = styles(theme, multiplier)

    const renderIcon = () => {
        if (isMod(shortcut) && imageSrc) {
            return (
                <Image
                    style={style.iconImage}
                    source={imageSrc}
                    resizeMode="contain"
                    // use fallback if url fails to load
                    onError={() => {
                        setImageSrc(FediModImages.default)
                    }}
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
                    maxFontSizeMultiplier={1.2}
                />
            )
        }
    }

    return (
        <Pressable
            containerStyle={[
                style.container,
                recoveryInProgress ? style.disabled : null,
            ]}
            onPress={() => onSelect(shortcut)}
            onLongPress={() => onHold?.(shortcut)}
            disabled={recoveryInProgress}>
            <BubbleView containerStyle={style.iconContainer}>
                {renderIcon()}
            </BubbleView>
            <View style={style.title}>
                <Text
                    caption
                    medium
                    style={style.titleText}
                    adjustsFontSizeToFit>
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
            paddingHorizontal: theme.spacing.sm,
            flexDirection: 'column',
            paddingVertical: theme.spacing.xs,
        },
        disabled: {
            opacity: 0.5,
        },
        iconContainer: {
            width: iconSize,
            height: iconSize,
            overflow: 'hidden',
            borderRadius: theme.borders.fediModTileRadius,
            shadowColor: '#000',
            shadowOffset: {
                width: 0,
                height: 1,
            },
            shadowOpacity: 0.18,
            shadowRadius: 1.0,

            elevation: 1,
            backgroundColor: theme.colors.white,
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
