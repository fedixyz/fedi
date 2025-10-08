import { Text, TextProps, Theme, useTheme } from '@rneui/themed'
import { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import Flex from '../../ui/Flex'

export type ChatTileProps = {
    onPress: () => void
    onLongPress?: () => void
    avatar: ReactNode
    title: string
    subtitle: string
    subtitleProps?: TextProps
    timestamp?: ReactNode
    showUnreadIndicator?: boolean
    disabled?: boolean
    delayLongPress?: number
}

const ChatTile = ({
    onPress,
    onLongPress,
    avatar,
    title,
    subtitle,
    subtitleProps,
    timestamp,
    showUnreadIndicator = false,
    disabled = false,
    delayLongPress = 300,
}: ChatTileProps) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Pressable
            style={({ pressed }) => [
                style.container,
                pressed && !disabled
                    ? { backgroundColor: theme.colors.primary05 }
                    : {},
            ]}
            disabled={disabled}
            onLongPress={onLongPress}
            delayLongPress={delayLongPress}
            onPress={onPress}>
            <View style={style.iconContainer}>
                {showUnreadIndicator && (
                    <View
                        style={[
                            style.unreadIndicator,
                            { opacity: showUnreadIndicator ? 1 : 0 },
                        ]}
                    />
                )}
                <Flex
                    row
                    align="center"
                    justify="start"
                    style={style.chatTypeIconContainer}>
                    {avatar}
                </Flex>
            </View>
            <Flex grow row style={style.content}>
                <Flex grow basis={false} style={style.preview}>
                    <Text style={style.title} numberOfLines={1} bold>
                        {title}
                    </Text>
                    <Text caption numberOfLines={2} {...subtitleProps}>
                        {subtitle}
                    </Text>
                </Flex>
                {timestamp && (
                    <Flex align="end" justify="start" gap="xs">
                        <Text
                            small
                            style={style.timestamp}
                            adjustsFontSizeToFit
                            maxFontSizeMultiplier={1.4}>
                            {timestamp}
                        </Text>
                    </Flex>
                )}
            </Flex>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.sm,
            width: '100%',
            borderRadius: theme.borders.defaultRadius,
        },
        iconContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            flexShrink: 0,
        },
        content: {
            height: theme.sizes.mediumAvatar,
        },
        preview: {
            alignSelf: 'center',
        },
        chatTypeIconContainer: {
            marginRight: theme.spacing.md,
        },
        unreadIndicator: {
            backgroundColor: theme.colors.red,
            height: theme.sizes.unreadIndicatorSize,
            width: theme.sizes.unreadIndicatorSize,
            paddingHorizontal: theme.spacing.xs,
            borderRadius: theme.sizes.unreadIndicatorSize * 0.5,
            transform: [
                {
                    translateX: theme.sizes.unreadIndicatorSize * -0.3,
                },
            ],
        },
        title: {
            width: '80%',
        },
        subtitle: {},
        timestamp: {
            color: theme.colors.grey,
            paddingRight: theme.spacing.md,
        },
    })

export default ChatTile
