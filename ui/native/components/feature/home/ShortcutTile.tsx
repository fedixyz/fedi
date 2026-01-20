import { Badge, Text, Theme, useTheme } from '@rneui/themed'
import { decode } from 'html-entities'
import { useEffect, useState } from 'react'
import {
    Image,
    ImageSourcePropType,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'
import { SvgUri } from 'react-native-svg'

import { selectIsNewMod } from '@fedi/common/redux/mod'
import { tryFetchUrlMetadata } from '@fedi/common/utils/fedimods'
import { makeLog } from '@fedi/common/utils/log'
import { constructUrl } from '@fedi/common/utils/neverthrow'
import { stripAndDeduplicateWhitespace } from '@fedi/common/utils/strings'

import { FediModImages } from '../../../assets/images'
import { useAppSelector } from '../../../state/hooks'
import { FediMod, Shortcut, ShortcutType } from '../../../types'
import { getMiniAppTileIconSize } from '../../../utils/layout'
import { BubbleView } from '../../ui/BubbleView'
import { Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage, { SvgImageName, SvgImageSize } from '../../ui/SvgImage'

type ShortcutTileProps = {
    disabled?: boolean
    iconOnly?: boolean
    shortcut: FediMod
    onHold?: (fediMod: FediMod) => void
    onSelect: (fediMod: FediMod) => void
}

const log = makeLog('ShortcutTile')

function isMod(shortcut: Shortcut | FediMod): shortcut is FediMod {
    return shortcut.type === ShortcutType.fediMod
}

type ShortcutTileIconProps = {
    shortcut: FediMod
}

export const ShortcutTileIcon = ({ shortcut }: ShortcutTileIconProps) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()
    const multiplier = Math.min(fontScale, 2)

    const style = styles(theme, multiplier)
    const [imageSrc, setImageSrc] = useState<ImageSourcePropType>(
        FediModImages.default,
    )

    useEffect(() => {
        if (isMod(shortcut)) {
            // use local image if we have it
            if (FediModImages[shortcut.id]) {
                setImageSrc(FediModImages[shortcut.id])
            } else if (shortcut.imageUrl) {
                // then try image url
                setImageSrc({ uri: shortcut.imageUrl, cache: 'force-cache' })
            } else {
                constructUrl(shortcut.url)
                    .asyncAndThen(tryFetchUrlMetadata)
                    .match(
                        ({ icon }) => {
                            setImageSrc({ uri: icon, cache: 'force-cache' })
                        },
                        e => {
                            log.error('Failed to fetch fedi mod metadata', e)
                        },
                    )
            }
        }
    }, [shortcut])

    if (isMod(shortcut) && imageSrc) {
        const isSvg =
            // imageSrc can be an array of ImageUriSource
            // see https://reactnative.dev/docs/image#source
            !Array.isArray(imageSrc) &&
            // ImageRequireSource can be a number, so rule that out too
            typeof imageSrc !== 'number' &&
            imageSrc.uri?.endsWith('svg')

        if (isSvg) {
            return (
                <SvgUri
                    uri={imageSrc.uri ?? null}
                    onError={() => {
                        setImageSrc(FediModImages.default)
                    }}
                    width={48}
                    height={48}
                    style={style.iconImage}
                    fallback={
                        <Image
                            style={style.iconImage}
                            source={FediModImages.default}
                            resizeMode="contain"
                        />
                    }
                    // Ensure the SVG is always contained and centered
                    // Does the equivalent of resizeMode="contain" for SVGs
                    preserveAspectRatio="xMidYMid meet"
                />
            )
        }

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

const ShortcutTile = ({
    disabled = false,
    iconOnly = false,
    shortcut,
    onHold,
    onSelect,
}: ShortcutTileProps) => {
    const { theme } = useTheme()
    const { fontScale } = useWindowDimensions()

    const isNew = useAppSelector(s => selectIsNewMod(s, shortcut))
    const shortcutTitle = decode(stripAndDeduplicateWhitespace(shortcut.title))
    const multiplier = Math.min(fontScale, 2)
    const style = styles(theme, multiplier)

    const handlePress = () => {
        if (!disabled) {
            onSelect(shortcut)
        }
    }

    return (
        <Pressable
            disabled={disabled}
            containerStyle={style.container}
            onPress={handlePress}
            delayLongPress={250}
            onLongPress={() => onHold?.(shortcut)}>
            <View style={style.iconContainer}>
                <BubbleView containerStyle={style.bubbleContainer}>
                    <ShortcutTileIcon shortcut={shortcut} />
                </BubbleView>
            </View>

            {!iconOnly && (
                <>
                    <Row align="center" justify="start" style={style.title}>
                        <Text
                            caption
                            medium
                            style={style.titleText}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.5}>
                            {shortcutTitle}
                        </Text>
                    </Row>
                    {isNew && (
                        <Badge
                            value="New"
                            containerStyle={style.badgeContainer}
                            badgeStyle={style.badge}
                            textStyle={style.badgeText}
                        />
                    )}
                </>
            )}
        </Pressable>
    )
}

const styles = (theme: Theme, fontScale: number) => {
    const iconSize = getMiniAppTileIconSize(theme, fontScale)
    return StyleSheet.create({
        badge: {
            backgroundColor: theme.colors.green100,
        },
        badgeContainer: {
            color: theme.colors.black,
            position: 'absolute',
            top: 0,
            transform: [
                {
                    translateX: theme.spacing.xl,
                },
            ],
        },
        badgeText: {
            color: theme.colors.black,
            fontWeight: 500,
        },
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
            shadowColor: '#000',
            shadowOffset: {
                width: 0,
                height: 1,
            },
            shadowOpacity: 0.3,
            shadowRadius: 1.0,

            elevation: 1,
        },
        bubbleContainer: {
            width: iconSize,
            height: iconSize,
            overflow: 'hidden',
            borderRadius: theme.borders.tileRadius,
            backgroundColor: theme.colors.white,
        },
        iconImage: {
            width: iconSize,
            height: iconSize,
            overflow: 'hidden',
            borderRadius: theme.borders.tileRadius,
            marginBottom: theme.spacing.xs,
        },
        iconSvg: {
            width: iconSize,
            height: iconSize,
            borderRadius: theme.borders.tileRadius,
            backgroundColor: theme.colors.primary,
            marginBottom: theme.spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
        },
        title: {
            paddingBottom: theme.spacing.xs,
            paddingHorizontal: theme.spacing.xs,
        },
        titleText: {
            textAlign: 'center',
            lineHeight: theme.sizes.miniAppTitleLineHeight,
        },
    })
}

export default ShortcutTile
