import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'
import Video from 'react-native-video'

import { FileUri, HttpUri } from '@fedi/common/types/media'

import { Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'
import { useDownloadResource } from '../utils/hooks/media'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatVideoViewer'
>

const ChatVideoViewer: React.FC<Props> = ({ route, navigation }: Props) => {
    const { theme } = useTheme()
    const { uri } = route.params
    const {
        uri: videoUri,
        isDownloading,
        handleDownload,
    } = useDownloadResource(uri as HttpUri | FileUri)

    const style = styles(theme)

    return (
        <SafeAreaContainer style={style.fullScreenContainer} edges="vertical">
            <Row
                align="center"
                justify="between"
                style={style.fullScreenVideoHeader}>
                <Pressable
                    onPress={() => {
                        navigation.goBack()
                    }}>
                    <SvgImage name="Close" color={theme.colors.secondary} />
                </Pressable>
                <Pressable onPress={handleDownload}>
                    {isDownloading ? (
                        <ActivityIndicator />
                    ) : (
                        <SvgImage
                            name="Download"
                            color={theme.colors.secondary}
                        />
                    )}
                </Pressable>
            </Row>
            <Video
                source={{ uri: videoUri ?? uri }}
                style={style.fullScreenVideo}
                controls
                resizeMode="contain"
            />
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        fullScreenContainer: {
            backgroundColor: theme.colors.night,
        },
        fullScreenVideo: {
            flex: 1,
        },
        fullScreenVideoHeader: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.lg,
        },
    })

export default ChatVideoViewer
