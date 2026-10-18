import { Text, TextProps, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Linking, StyleSheet, Text as RNText } from 'react-native'

import stringUtils from '@fedi/common/utils/StringUtils'
import { parseTextWithUrls } from '@fedi/common/utils/linking'
import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('LinkifiedText')

type Props = Omit<TextProps, 'children'> & {
    children: string
}

const openLink = async (url: string) => {
    try {
        // Linking.openURL is patched to route Fedi deeplinks in-app
        await Linking.openURL(url)
    } catch {
        log.warn('Failed to open link')
    }
}

const LinkifiedText: React.FC<Props> = ({ children, ...props }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Text {...props}>
            {parseTextWithUrls(children).map((segment, i) =>
                segment.type === 'url' ? (
                    <RNText
                        key={i}
                        accessibilityRole="link"
                        style={style.link}
                        onPress={() => openLink(segment.content)}>
                        {stringUtils.truncateString(segment.content, 75)}
                    </RNText>
                ) : (
                    <React.Fragment key={i}>{segment.content}</React.Fragment>
                ),
            )}
        </Text>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        link: {
            color: theme.colors.link,
            textDecorationLine: 'underline',
        },
    })

export default LinkifiedText
