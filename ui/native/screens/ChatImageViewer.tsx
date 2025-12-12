import { ImageZoom } from '@likashefqet/react-native-image-zoom'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'

import { FileUri, HttpUri } from '@fedi/common/types/media'

import { Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'
import { useDownloadResource } from '../utils/hooks/media'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatImageViewer'
>

const ChatImageViewer: React.FC<Props> = ({ route, navigation }: Props) => {
    const { theme } = useTheme()
    const { uri, downloadable = true } = route.params
    const {
        uri: imageUri,
        isDownloading,
        handleDownload,
    } = useDownloadResource(uri as HttpUri | FileUri)

    const style = styles(theme)

    return (
        <SafeAreaContainer style={style.imageViewerContainer} edges="vertical">
            <Row
                align="center"
                justify="between"
                style={style.imageViewerHeader}>
                <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
                    <SvgImage name="Close" color={theme.colors.secondary} />
                </Pressable>
                {downloadable && (
                    <Pressable hitSlop={10} onPress={handleDownload}>
                        {isDownloading ? (
                            <ActivityIndicator />
                        ) : (
                            <SvgImage
                                name="Download"
                                color={theme.colors.secondary}
                            />
                        )}
                    </Pressable>
                )}
            </Row>
            <ImageZoom uri={imageUri ?? uri} style={style.imageZoomContainer} />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        imageViewerContainer: {
            backgroundColor: theme.colors.night,
        },
        imageZoomContainer: {
            flex: 1,
        },
        imageViewerHeader: {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
        },
    })

export default ChatImageViewer
