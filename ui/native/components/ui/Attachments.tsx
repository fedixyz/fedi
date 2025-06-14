import { Button, Image, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import {
    Asset,
    ImageLibraryOptions,
    launchImageLibrary,
} from 'react-native-image-picker'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import Flex from './Flex'
import SvgImage, { SvgImageSize } from './SvgImage'

const log = makeLog('Attachments')

interface Props {
    options: ImageLibraryOptions
    attachments: Asset[]
    setAttachments: (assets: Asset[]) => void
    uploadButton?: boolean
}

export const Attachments: React.FC<Props> = ({
    options,
    attachments,
    setAttachments,
    uploadButton,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const style = styles(theme)

    const handleAddAttachment = async () => {
        try {
            const res = await launchImageLibrary(options)
            if (res.assets) {
                // Exclude duplicates
                setAttachments(
                    [...attachments, ...res.assets].filter(
                        ({ uri }, idx, arr) =>
                            arr.findIndex(a => a.uri === uri) === idx,
                    ),
                )
            }
        } catch (err) {
            log.error('Failed to launch image library', err)
            toast.error(t, err)
        }
    }

    return (
        <Flex row gap="lg" wrap>
            {attachments.map(asset => (
                <View key={asset.uri} style={style.asset}>
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
                            setAttachments(attachments.filter(a => a !== asset))
                        }>
                        <SvgImage
                            name="Close"
                            size={SvgImageSize.xs}
                            color={theme.colors.white}
                        />
                    </Pressable>
                </View>
            ))}
            {uploadButton && (
                <Button
                    buttonStyle={style.uploadButton}
                    icon={<SvgImage size={SvgImageSize.sm} name="Plus" />}
                    title={
                        <Text caption bold style={style.uploadButtonTitle}>
                            {t('words.upload')}
                        </Text>
                    }
                    onPress={handleAddAttachment}
                />
            )}
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
