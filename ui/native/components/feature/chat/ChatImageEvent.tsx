import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'

import {
    selectPreviewMediaMatchingEventContent,
    setSelectedChatMessage,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { scaleAttachment } from '@fedi/common/utils/media'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useDownloadResource } from '../../../utils/hooks/media'
import { Column } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type ChatImageEventProps = {
    event: MatrixEvent<'m.image'>
    isInViewport?: boolean
}

const ChatImageEvent: React.FC<ChatImageEventProps> = ({
    event,
    isInViewport = true,
}: ChatImageEventProps) => {
    // If the user sends an image, try to find the preview image matching the `event.content` to derive the existing URI
    const matchingPreviewImage = useAppSelector(s =>
        selectPreviewMediaMatchingEventContent(s, event.content),
    )
    const { uri, isError, setIsError, handleCopyResource } =
        useDownloadResource(event, {
            loadResourceInitially: false,
        })
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const navigation = useNavigation()

    const resolvedUri = matchingPreviewImage?.media.uri ?? uri ?? ''

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const style = styles(theme)

    const dimensions = scaleAttachment(
        event.content.info?.width || 1, // Should't be falsy, but fallback to 1 to avoid division by zero
        event.content.info?.height || 1,
        theme.sizes.maxMessageWidth,
        400,
    )

    const imageBaseStyle = [style.imageBase, dimensions]

    useEffect(() => {
        if (resolvedUri || !isInViewport) return

        handleCopyResource()
    }, [resolvedUri, isInViewport, handleCopyResource])

    if (resolvedUri)
        return (
            <Pressable
                onPress={() =>
                    navigation.navigate('ChatImageViewer', { uri: resolvedUri })
                }
                onLongPress={handleLongPress}>
                <Image
                    source={{ uri: resolvedUri, cache: 'force-cache' }}
                    style={imageBaseStyle}
                    onError={() => setIsError(true)}
                />
            </Pressable>
        )

    if (isError)
        return (
            <View style={imageBaseStyle}>
                <Column align="center">
                    <SvgImage name="ImageOff" color={theme.colors.grey} />
                    <Text caption color={theme.colors.darkGrey}>
                        {t('errors.failed-to-load-image')}
                    </Text>
                </Column>
            </View>
        )

    return (
        <View style={imageBaseStyle}>
            <ActivityIndicator />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        imageBase: {
            maxWidth: theme.sizes.maxMessageWidth,
            maxHeight: 400,
            backgroundColor: theme.colors.extraLightGrey,
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
    })

export default ChatImageEvent
