import { Text, Theme, useTheme } from '@rneui/themed'
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react'
import {
    ActivityIndicator,
    Image,
    Linking,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'

import { useMatrixUrlPreview } from '@fedi/common/hooks/matrix'

import { fedimint } from '../../../bridge'
import { useMatrixFile } from '../../../utils/hooks/media'
import { scaleAttachment } from '../../../utils/media'

type Props = {
    url: string
    isFirst: boolean
    setHasWidePreview: Dispatch<SetStateAction<boolean>>
    hasWidePreview: boolean
}

const ChatEmbeddedLinkPreview: React.FC<Props> = ({
    url,
    isFirst,
    setHasWidePreview,
    hasWidePreview,
}) => {
    const urlPreview = useMatrixUrlPreview({ url, fedimint })
    const [isPressed, setIsPressed] = useState(false)
    const [mediaDimensions, setMediaDimensions] = useState<{
        width: number
        height: number
    } | null>(null)
    const { theme } = useTheme()
    const { uri, isLoading, isError } = useMatrixFile(
        urlPreview?.['og:image'] ?? null,
    )

    const style = styles(theme)

    useEffect(() => {
        if (urlPreview) {
            setHasWidePreview(Boolean(urlPreview?.['og:title']))

            const imageWidth = urlPreview['og:image:width']
            const imageHeight = urlPreview['og:image:height']
            if (imageWidth && imageHeight) {
                // Show wide preview only if the url preview has a title
                setMediaDimensions({
                    width: imageWidth,
                    height: imageHeight,
                })
            }
        }
    }, [urlPreview, setHasWidePreview])

    const dimensions = useMemo(() => {
        if (mediaDimensions) {
            return scaleAttachment(
                // Scale up the image to fit the max message width
                Math.max(mediaDimensions.width, theme.sizes.maxMessageWidth),
                Math.max(
                    mediaDimensions.height,
                    (mediaDimensions.height / mediaDimensions.width) *
                        theme.sizes.maxMessageWidth,
                ),
                theme.sizes.maxMessageWidth,
                400,
            )
        } else {
            return {
                width: theme.sizes.maxMessageWidth,
                // In order for the Media to start loading, width and height have to be a non-zero value
                height: 1,
            }
        }
    }, [mediaDimensions, theme])

    return (
        <Pressable
            style={[
                style.container,
                isFirst && hasWidePreview
                    ? style.widePreview
                    : { marginTop: theme.spacing.xxs },
            ]}
            onPress={() => {
                Linking.openURL(url)
            }}
            onPressIn={() => setIsPressed(true)}
            onPressOut={() => setIsPressed(false)}>
            {mediaDimensions && !isLoading && !isError && uri ? (
                <Image
                    source={{ uri }}
                    onLoad={event => {
                        setMediaDimensions(event.nativeEvent.source)
                    }}
                    height={dimensions.height}
                    width={dimensions.width}
                />
            ) : mediaDimensions && isLoading ? (
                <View style={[style.imageLoadingPlaceholder, dimensions]}>
                    <ActivityIndicator />
                </View>
            ) : null}
            {urlPreview?.['og:title'] && (
                <View
                    style={[
                        style.siteContent,
                        {
                            backgroundColor: isPressed
                                ? theme.colors.lightGrey
                                : theme.colors.extraLightGrey,
                        },
                    ]}>
                    <View style={style.siteInfo}>
                        <View style={style.siteHeader}>
                            <Text medium caption numberOfLines={2}>
                                {urlPreview['og:title']}
                            </Text>
                        </View>
                        {urlPreview['og:description'] && (
                            <Text
                                small
                                style={style.urlDescription}
                                numberOfLines={3}>
                                {urlPreview['og:description']}
                            </Text>
                        )}
                    </View>
                </View>
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: theme.colors.lightGrey,
        },
        siteHeader: {
            display: 'flex',
            flexDirection: 'row',
            gap: theme.spacing.sm,
        },
        siteContent: {
            flexDirection: 'row',
            padding: 8,
            gap: theme.spacing.md,
        },
        siteInfo: {
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        urlDescription: {
            color: theme.colors.darkGrey,
        },
        widePreview: {
            borderTopRightRadius: 0,
            borderTopLeftRadius: 0,
            width: theme.sizes.maxMessageWidth,
        },
        imageLoadingPlaceholder: {
            maxHeight: 400,
            backgroundColor: theme.colors.extraLightGrey,
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
    })

export default ChatEmbeddedLinkPreview
