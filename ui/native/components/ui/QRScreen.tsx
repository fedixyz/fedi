import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'

import QRCodeContainer from './QRCodeContainer'

interface Props {
    /** Value to render the QR code with */
    qrValue: string
    /** Message to show when the copy button is pressed */
    copyMessage: string
    /** Optional different value when copied, defaults to using qrValue */
    copyValue?: string
    /** H2 title at the top of screen */
    title?: string
    /** Smaller, grey title suffix, intended for username suffix */
    titleSuffix?: string
    /** Caption text below title */
    subtitle?: string
    /** Content to display at the bottom, typically help text or an action */
    bottom?: React.ReactNode
    /** Use dark theme for screen */
    dark?: boolean
}

const QRScreen: React.FC<Props> = ({
    title,
    titleSuffix,
    subtitle,
    qrValue,
    copyValue = qrValue,
    copyMessage,
    bottom,
    dark,
}) => {
    const { theme } = useTheme()
    const { width } = useWindowDimensions()

    const style = styles(theme, width, dark)
    return (
        <View style={style.container}>
            <View style={style.topContainer}>
                <View style={style.titleContainer}>
                    {title && (
                        <Text
                            h2
                            medium
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={style.title}>
                            {title}
                        </Text>
                    )}
                    {titleSuffix && (
                        <Text numberOfLines={1} bold style={style.titleSuffix}>
                            {titleSuffix}
                        </Text>
                    )}
                </View>
                {subtitle && (
                    <Text caption style={style.subtitle}>
                        {subtitle}
                    </Text>
                )}
            </View>

            <QRCodeContainer
                copyMessage={copyMessage}
                copyValue={copyValue}
                dark={dark}
                qrValue={qrValue}
            />

            <View style={style.bottomContainer}>{bottom}</View>
        </View>
    )
}

const styles = (theme: Theme, width: number, dark?: boolean) =>
    StyleSheet.create({
        container: {
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.xl,
            gap: theme.spacing.lg,
            backgroundColor: dark ? theme.colors.primary : undefined,
        },
        topContainer: {
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: theme.spacing.sm,
            width: '100%',
        },
        titleContainer: {
            textAlign: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            gap: theme.spacing.xs,
        },
        title: {
            textAlign: 'center',
        },
        titleSuffix: {
            color: theme.colors.grey,
        },
        subtitle: {
            textAlign: 'center',
            color: theme.colors.grey,
        },
        bottomContainer: {
            width: '100%',
        },
    })

export default QRScreen
