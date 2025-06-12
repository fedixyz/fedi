import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { StyleProp, StyleSheet, ViewStyle } from 'react-native'

import { MatrixUser } from '@fedi/common/types'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import { AvatarSize } from '../../ui/Avatar'
import Flex from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'
import ChatAvatar from './ChatAvatar'

type UserItemProps = {
    user: MatrixUser
    selectUser: (userId: string) => void
    disabled?: boolean
    actionIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    showSuffix?: boolean
    showAdmin?: boolean
    containerStyle?: StyleProp<ViewStyle>
    // Pass a name to the chat avatar OTHER
    // than user.displayName
    overrideAvatarName?: string
}

const ChatUserTile: React.FC<UserItemProps> = ({
    user,
    selectUser,
    actionIcon = null,
    rightIcon = null,
    disabled = false,
    showSuffix = false,
    showAdmin = false,
    overrideAvatarName,
    containerStyle,
}: UserItemProps) => {
    const { theme } = useTheme()

    const suffix = useMemo(() => {
        return getUserSuffix(user.id)
    }, [user])

    const avatarUser = {
        ...user,
        displayName: overrideAvatarName || user.displayName,
    }

    const style = styles(theme)

    return (
        <Pressable
            containerStyle={containerStyle}
            onPress={disabled ? undefined : () => selectUser(user.id)}
            onLongPress={disabled ? undefined : () => selectUser(user.id)}>
            <Flex grow row align="center" fullWidth>
                <ChatAvatar
                    containerStyle={[style.avatar]}
                    user={avatarUser}
                    size={AvatarSize.md}
                />
                {showAdmin && (
                    <SvgImage
                        size={15}
                        name={'AdminBadge'}
                        containerStyle={style.adminBadge}
                    />
                )}
                <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    bold
                    style={[style.usernameText]}>
                    {user.displayName}
                </Text>
                {showSuffix && (
                    <Text
                        numberOfLines={1}
                        bold
                        caption
                        color={theme.colors.grey}>
                        {suffix}
                    </Text>
                )}
                <Flex row align="center" style={style.iconContainer}>
                    {rightIcon && rightIcon}
                    {actionIcon && actionIcon}
                </Flex>
            </Flex>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        avatar: {
            marginRight: theme.spacing.md,
        },
        adminBadge: {
            marginRight: theme.spacing.xs,
        },
        usernameText: {
            flexShrink: 2,
            paddingRight: theme.spacing.xs,
        },
        iconContainer: {
            marginLeft: 'auto',
            gap: theme.spacing.xs,
            paddingLeft: theme.spacing.sm,
        },
    })

export default ChatUserTile
