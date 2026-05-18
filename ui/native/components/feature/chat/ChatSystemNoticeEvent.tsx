import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

type Props = {
    text: string
}

const ChatSystemNoticeEvent: React.FC<Props> = ({ text }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <View style={style.container}>
            <Text caption medium style={style.text}>
                {text}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            paddingHorizontal: theme.spacing.lg,
            width: '100%',
        },
        text: {
            color: theme.colors.grey,
            lineHeight: 18,
            textAlign: 'center',
        },
    })

export default ChatSystemNoticeEvent
