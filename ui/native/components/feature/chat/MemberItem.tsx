import { Text, Theme, useTheme } from '@rneui/themed'
import React, { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { ChatMember } from '@fedi/common/types'

import Avatar, { AvatarSize } from '../../ui/Avatar'

type MemberItemProps = {
    member: ChatMember
    selectMember: (member: ChatMember) => void
    actionIcon?: ReactNode
}

const MemberItem: React.FC<MemberItemProps> = ({
    member,
    selectMember,
    actionIcon = null,
}: MemberItemProps) => {
    const { theme } = useTheme()

    return (
        <Pressable
            style={[styles(theme).container]}
            onPress={() => {
                selectMember(member)
            }}>
            <Avatar
                id={member.id}
                name={member.username}
                size={AvatarSize.md}
            />
            <Text numberOfLines={1} bold style={[styles(theme).usernameText]}>
                {member.username}
            </Text>
            {actionIcon && (
                <View style={styles(theme).checkboxContainer}>
                    {actionIcon}
                </View>
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingVertical: theme.spacing.sm,
            width: '100%',
        },
        usernameText: {
            marginLeft: theme.spacing.md,
        },
        checkboxContainer: {
            marginLeft: 'auto',
        },
    })

export default MemberItem
