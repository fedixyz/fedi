import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import Header from '../../ui/Header'

type Props = {
    title?: string
}

const DefaultChatHeader: React.FC<Props> = ({ title }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Header
            containerStyle={style.container}
            backButton
            headerCenter={
                title ? (
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {title}
                    </Text>
                ) : undefined
            }
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.xs,
        },
    })

export default DefaultChatHeader
