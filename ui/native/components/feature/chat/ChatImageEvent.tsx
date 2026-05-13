import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'

import { MAX_CHAT_MEDIA_HEIGHT } from '@fedi/common/constants/matrix'
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
import { ConversationMessageVisibilityContext } from './useConversationMessageFocus'

type ChatImageEventProps = {
    event: MatrixEvent<'m.image'>
}

const ChatImageEvent: React.FC<ChatImageEventProps> = ({
    event,
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
    const messageVisibilityStore = useContext(
        ConversationMessageVisibilityContext,
    )
    const [isInViewport, setIsInViewport] = useState(
        () => messageVisibilityStore?.isVisible(event.id as string) ?? true,
    )

    const resolvedUri = matchingPreviewImage?.media.uri ?? uri ?? ''

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const style = styles(theme)

    const fallbackImageSize = Math.min(
        theme.sizes.maxMessageWidth,
        MAX_CHAT_MEDIA_HEIGHT,
    )
    const dimensions =
        event.content.info?.width && event.content.info?.height
            ? scaleAttachment(
                  event.content.info.width,
                  event.content.info.height,
                  theme.sizes.maxMessageWidth,
                  MAX_CHAT_MEDIA_HEIGHT,
              )
            : { width: fallbackImageSize, height: fallbackImageSize }

    const imageBaseStyle = [style.imageBase, dimensions]

    useEffect(() => {
        if (!messageVisibilityStore) {
            setIsInViewport(true)
            return
        }

        const eventId = event.id as string

        setIsInViewport(messageVisibilityStore.isVisible(eventId))

        return messageVisibilityStore.subscribe(eventId, setIsInViewport)
    }, [event.id, messageVisibilityStore])

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
            maxHeight: MAX_CHAT_MEDIA_HEIGHT,
            backgroundColor: theme.colors.extraLightGrey,
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        },
    })

export default ChatImageEvent
