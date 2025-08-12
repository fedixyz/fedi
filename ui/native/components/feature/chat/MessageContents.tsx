import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { ReactNode, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Linking,
    StyleProp,
    StyleSheet,
    TextStyle,
    View,
    ViewStyle,
} from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'
import { decodeFediMatrixRoomUri } from '@fedi/common/utils/matrix'

import EmbeddedJoinGroupButton from './EmbeddedJoinGroupButton'

const log = makeLog('MessageContents')

type MessageContentsProps = {
    content: string
    sentByMe: boolean
    textStyles: StyleProp<ViewStyle | TextStyle>[]
}

const MessageContents: React.FC<MessageContentsProps> = ({
    content,
    sentByMe,
    textStyles,
}: MessageContentsProps) => {
    const { theme } = useTheme()
    const toast = useToast()
    const { t } = useTranslation()

    const handleLinkPress = useCallback((url: string) => {
        log.debug('url', url)
        Linking.openURL(url)
    }, [])

    const handleLinkLongPress = useCallback(
        (url: string) => {
            Clipboard.setString(url)
            toast.show({
                content: t('phrases.copied-to-clipboard'),
                status: 'success',
            })
        },
        [toast, t],
    )

    let text: ReactNode = null
    // Check if there are any group invite codes in the message like this
    //      fedi:room:uuid_generated_on_group_creation:::
    const regex = /fedi:room:[^\s\n]*:::/g
    const groupCodeMatches: string[] | null = content.match(regex)

    // groupCodeMatches is null if no group invite code is found
    if (groupCodeMatches) {
        // construct an array that identifies text content from group invite
        // code strings as separate renderable elements
        const messageElements: string[] = []

        // there may be multiple group invite codes so this makes sure
        // to convert each of them to a embedded button
        groupCodeMatches.reduce(
            (contentString: string, match: string, index: number) => {
                const splitText = contentString.split(match)
                const textBeforeCode = splitText[0]
                const textAfterCode = splitText[1]

                // push any preceding text in first
                messageElements.push(textBeforeCode)
                // then push the group invite code
                messageElements.push(match)

                // only push subsequent text if this is the last invite code
                if (index + 1 === groupCodeMatches?.length) {
                    messageElements.push(textAfterCode)
                }

                // otherwise return the remaining string text for next pass
                return textAfterCode
            },
            content,
        )

        text = (
            <View>
                {messageElements.map((m: string, i: number) => {
                    if (!m) return null
                    const isMatrixChatGroupCode = m.startsWith('fedi:room:')
                    if (isMatrixChatGroupCode) {
                        const groupId = decodeFediMatrixRoomUri(m)
                        return (
                            <EmbeddedJoinGroupButton
                                key={`mi-t-${i}`}
                                groupId={groupId}
                            />
                        )
                    }
                    return (
                        <Hyperlink
                            key={`mi-t-${i}`}
                            linkStyle={
                                sentByMe
                                    ? styles(theme).outgoingLinkedText
                                    : styles(theme).incomingLinkedText
                            }
                            onPress={handleLinkPress}
                            onLongPress={handleLinkLongPress}>
                            <Text
                                caption
                                style={[
                                    ...textStyles,
                                    styles(theme).consistentText,
                                ]}>
                                {m.trim()}
                            </Text>
                        </Hyperlink>
                    )
                })}
            </View>
        )
    } else {
        // otherwise just render text normally with consistent container
        text = (
            <View style={{ minHeight: 20 }}>
                <Text caption medium style={textStyles}>
                    {content}
                </Text>
            </View>
        )
    }

    return (
        <Hyperlink
            linkStyle={
                sentByMe
                    ? styles(theme).outgoingLinkedText
                    : styles(theme).incomingLinkedText
            }
            onPress={handleLinkPress}
            onLongPress={handleLinkLongPress}>
            {text}
        </Hyperlink>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        topPaddedText: {
            marginTop: theme.spacing.sm,
        },
        bottomPaddedText: {
            marginBottom: theme.spacing.sm,
        },
        consistentText: {
            marginVertical: theme.spacing.xs / 2,
        },
        incomingLinkedText: {
            textDecorationLine: 'underline',
            color: theme.colors.blue,
        },
        outgoingLinkedText: {
            textDecorationLine: 'underline',
            color: theme.colors.secondary,
        },
    })

export default MessageContents
