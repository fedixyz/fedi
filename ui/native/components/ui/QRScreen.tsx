import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import Flex from './Flex'
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

    const style = styles(theme, dark)
    return (
        <Flex
            grow
            align="center"
            justify="between"
            gap="lg"
            style={style.container}>
            <Flex align="center" justify="end" gap="sm" fullWidth>
                <Flex row center gap="sm" fullWidth>
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
                </Flex>
                {subtitle && (
                    <Text caption style={style.subtitle}>
                        {subtitle}
                    </Text>
                )}
            </Flex>

            <QRCodeContainer
                copyMessage={copyMessage}
                copyValue={copyValue}
                dark={dark}
                qrValue={qrValue}
            />

            <Flex fullWidth>{bottom}</Flex>
        </Flex>
    )
}

const styles = (theme: Theme, dark?: boolean) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
            backgroundColor: dark ? theme.colors.primary : undefined,
        },
        title: {
            textAlign: 'center',
        },
        titleSuffix: {
            textAlign: 'center',
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
