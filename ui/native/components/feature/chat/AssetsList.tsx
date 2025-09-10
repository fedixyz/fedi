import { Image, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Asset } from 'react-native-image-picker'

import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

interface Props {
    assets: Asset[]
    setAttachments: (assets: Asset[]) => void
}

export const AssetsList: React.FC<Props> = ({ assets, setAttachments }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    const attachmentListItems = useMemo(
        () =>
            assets
                // To prevent layout shifts and unwanted reordering
                // First sort by file name then place images before video attachments
                .sort((a, b) =>
                    (a.fileName ?? '').localeCompare(b.fileName ?? ''),
                )
                .sort((a, b) => {
                    const aMime = a.type ?? ''
                    const bMime = b.type ?? ''

                    if (aMime === bMime) return 0
                    if (aMime.startsWith('image')) return -1
                    return 1
                }),
        [assets],
    )

    return (
        <Flex row gap="lg" wrap>
            {attachmentListItems.map((asset, i) => (
                <View key={`asset-item-${i}`} style={style.asset}>
                    {asset.type?.startsWith('image') ? (
                        <Image
                            source={{
                                uri: asset.uri,
                                width: asset.width,
                                height: asset.height,
                            }}
                            style={style.image}
                            resizeMode="cover"
                        />
                    ) : asset.type?.startsWith('video') ? (
                        <Flex center style={style.preview}>
                            <SvgImage name="Video" />
                        </Flex>
                    ) : (
                        <Flex center style={style.preview}>
                            <SvgImage name="File" />
                        </Flex>
                    )}
                    <Pressable
                        style={style.removeButton}
                        onPress={() =>
                            setAttachments(assets.filter(a => a !== asset))
                        }>
                        <SvgImage
                            name="Close"
                            size={SvgImageSize.xs}
                            color={theme.colors.white}
                        />
                    </Pressable>
                </View>
            ))}
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        asset: {
            position: 'relative',
            width: 48,
            height: 48,
        },
        image: {
            width: '100%',
            height: '100%',
            borderRadius: 8,
        },
        removeButton: {
            justifyContent: 'center',
            alignItems: 'center',
            position: 'absolute',
            top: -6,
            right: -6,
            width: 16,
            height: 16,
            borderRadius: 16,
            backgroundColor: theme.colors.night,
        },
        uploadButton: {
            padding: theme.spacing.md,
            backgroundColor: theme.colors.offWhite,
        },
        uploadButtonTitle: {
            marginLeft: theme.spacing.sm,
            color: theme.colors.primary,
        },
        preview: {
            backgroundColor: theme.colors.extraLightGrey,
            width: '100%',
            height: '100%',
            borderRadius: 8,
        },
    })
