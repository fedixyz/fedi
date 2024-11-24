import { Text, Theme, useTheme } from '@rneui/themed'
import React, { ReactNode } from 'react'
import {
    Linking,
    StyleProp,
    StyleSheet,
    TextStyle,
    View,
    ViewStyle,
} from 'react-native'
import Hyperlink from 'react-native-hyperlink'

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
                    const isMatrixChatGroupCode = m.startsWith('fedi:room:')
                    if (isMatrixChatGroupCode) {
                        const groupId = decodeFediMatrixRoomUri(m)
                        return (
                            <EmbeddedJoinGroupButton
                                key={`mi-t-${i}`}
                                groupId={groupId}
                            />
                        )
                    } else if (m) {
                        return (
                            <Text
                                key={`mi-t-${i}`}
                                caption
                                selectable={!sentByMe}
                                style={[
                                    ...textStyles,
                                    i !== 0 ? styles(theme).topPaddedText : {},
                                    i !== messageElements.length - 1
                                        ? styles(theme).bottomPaddedText
                                        : {},
                                ]}>
                                {m.trim()}
                            </Text>
                        )
                    } else {
                        return null
                    }
                })}
            </View>
        )
    } else {
        // otherwise just render text normally
        text = (
            <Text caption medium style={textStyles} selectable={!sentByMe}>
                {content}
            </Text>
        )
    }

    return (
        <Hyperlink
            linkStyle={
                sentByMe
                    ? styles(theme).outgoingLinkedText
                    : styles(theme).incomingLinkedText
            }
            onPress={url => {
                log.debug('url', url)
                Linking.openURL(url)
            }}>
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
