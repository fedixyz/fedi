import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'

import {
    matchAndRemovePreviewMedia,
    selectPreviewMediaMatchingEventContent,
    setSelectedChatMessage,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { scaleAttachment } from '@fedi/common/utils/media'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useDownloadResource } from '../../../utils/hooks/media'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type ChatImageEventProps = {
    event: MatrixEvent<MatrixEventContentType<'m.image'>>
}

const ChatImageEvent: React.FC<ChatImageEventProps> = ({
    event,
}: ChatImageEventProps) => {
    // If the user sends an image, try to find the preview image matching the `event.content` to derive the existing URI
    const matchingPreviewImage = useAppSelector(s =>
        selectPreviewMediaMatchingEventContent(s, event.content),
    )
    const { uri, isError } = useDownloadResource(event)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const navigation = useNavigation()

    const resolvedUri = uri ?? matchingPreviewImage?.media.uri ?? ''

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    const style = styles(theme)

    const dimensions = scaleAttachment(
        event.content.info.w,
        event.content.info.h,
        theme.sizes.maxMessageWidth,
        400,
    )

    const imageBaseStyle = [style.imageBase, dimensions]

    if (resolvedUri)
        return (
            <Pressable
                onPress={() =>
                    navigation.navigate('ChatImageViewer', { uri: resolvedUri })
                }
                onLongPress={handleLongPress}>
                <Image
                    source={{ uri: resolvedUri }}
                    style={imageBaseStyle}
                    onLoad={() => {
                        dispatch(matchAndRemovePreviewMedia(event.content))
                    }}
                />
            </Pressable>
        )

    if (isError)
        return (
            <View style={imageBaseStyle}>
                <Flex align="center">
                    <SvgImage name="ImageOff" color={theme.colors.grey} />
                    <Text caption color={theme.colors.darkGrey}>
                        {t('errors.failed-to-load-image')}
                    </Text>
                </Flex>
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
