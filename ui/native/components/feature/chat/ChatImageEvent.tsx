import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Image,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'
import { TemporaryDirectoryPath, exists } from 'react-native-fs'

import { setSelectedChatMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'
import { scaleAttachment } from '@fedi/common/utils/media'

import { fedimint } from '../../../bridge'
import { useAppDispatch } from '../../../state/hooks'
import { pathJoin, prefixFileUri } from '../../../utils/media'
import SvgImage from '../../ui/SvgImage'

type ChatImageEventProps = {
    event: MatrixEvent<MatrixEventContentType<'m.image'>>
}

const log = makeLog('ChatImageEvent')

const ChatImageEvent: React.FC<ChatImageEventProps> = ({
    event,
}: ChatImageEventProps) => {
    const [isLoading, setIsLoading] = useState(true)
    const [isError, setIsError] = useState(false)
    const [uri, setURI] = useState<string>('')
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const navigation = useNavigation()

    const resolvedUri = prefixFileUri(uri)

    const handleLongPress = () => {
        dispatch(setSelectedChatMessage(event))
    }

    useEffect(() => {
        const loadImage = async () => {
            try {
                const path = pathJoin(
                    TemporaryDirectoryPath,
                    event.content.body,
                )

                const imagePath = await fedimint.matrixDownloadFile(
                    path,
                    event.content,
                )

                const imageUri = prefixFileUri(imagePath)

                if (await exists(imageUri)) {
                    setURI(imageUri)
                } else {
                    throw new Error('Image does not exist in fs')
                }
            } catch (err) {
                log.error('Failed to load image', err)
                setIsError(true)
            } finally {
                setIsLoading(false)
            }
        }

        loadImage()
    }, [event.content])

    const style = styles(theme)

    const dimensions = scaleAttachment(
        event.content.info.w,
        event.content.info.h,
        theme.sizes.maxMessageWidth,
        400,
    )

    const imageBaseStyle = [style.imageBase, dimensions]

    return isLoading || !uri || isError ? (
        <View style={imageBaseStyle}>
            {isError ? (
                <View style={style.imageError}>
                    <SvgImage name="ImageOff" color={theme.colors.grey} />
                    <Text caption style={style.errorCaption}>
                        {t('errors.failed-to-load-image')}
                    </Text>
                </View>
            ) : (
                <ActivityIndicator />
            )}
        </View>
    ) : (
        <Pressable
            onPress={() =>
                navigation.navigate('ChatImageViewer', { uri: resolvedUri })
            }
            onLongPress={handleLongPress}>
            <Image
                source={{ uri: resolvedUri }}
                style={imageBaseStyle}
                onError={() => setIsError(true)}
            />
        </Pressable>
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
        imageError: {
            flexDirection: 'column',
            gap: theme.spacing.md,
            alignItems: 'center',
        },
        errorCaption: {
            color: theme.colors.darkGrey,
        },
    })

export default ChatImageEvent
