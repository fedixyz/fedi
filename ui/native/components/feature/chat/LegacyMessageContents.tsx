import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import {
    Linking,
    StyleProp,
    StyleSheet,
    TextStyle,
    ViewStyle,
} from 'react-native'
import Hyperlink from 'react-native-hyperlink'

import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('MessageContents')

type MessageContentsProps = {
    content: string
    sentByMe: boolean
    textStyles: StyleProp<ViewStyle | TextStyle>[]
}

const LegacyMessageContents: React.FC<MessageContentsProps> = ({
    content,
    sentByMe,
    textStyles,
}: MessageContentsProps) => {
    const { theme } = useTheme()

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
            <Text caption medium style={textStyles} selectable>
                {content}
            </Text>
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

export default LegacyMessageContents
