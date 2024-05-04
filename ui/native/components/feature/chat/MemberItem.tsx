import { Text, Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { MatrixPowerLevel, MatrixRoomMember } from '@fedi/common/types'

import Avatar, { AvatarSize } from '../../ui/Avatar'

type MemberItemProps = {
    member: MatrixRoomMember
    selectMember: (member: MatrixRoomMember) => void
    actionIcon?: React.ReactNode
    disabled?: boolean
    isCurrentUser?: boolean
}

/** @deprecated replaced by the reusable ChatUserTIle */
const MemberItem: React.FC<MemberItemProps> = ({
    member,
    selectMember,
    actionIcon = null,
    disabled = false,
    isCurrentUser = false,
}: MemberItemProps) => {
    const { theme } = useTheme()

    const memberName = isCurrentUser ? t('words.you') : member.displayName

    return (
        <Pressable
            style={[styles(theme).container]}
            onPress={() => {
                !disabled && selectMember(member)
            }}>
            <View style={styles(theme).usernameContainer}>
                <Avatar
                    id={member.id}
                    name={member.displayName}
                    size={AvatarSize.md}
                />
                <Text
                    numberOfLines={1}
                    bold
                    style={[styles(theme).usernameText]}>
                    {memberName}
                </Text>
                <Text>
                    {member.powerLevel >= MatrixPowerLevel.Admin
                        ? t('words.admin')
                        : member.powerLevel >= MatrixPowerLevel.Moderator
                        ? t('words.moderator')
                        : t('words.member')}
                </Text>
                {actionIcon && (
                    <View style={styles(theme).checkboxContainer}>
                        <>{actionIcon}</>
                    </View>
                )}
            </View>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: theme.spacing.sm,
            width: '100%',
        },
        usernameContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
        },
        usernameText: {
            marginHorizontal: theme.spacing.md,
            flex: 1,
        },
        checkboxContainer: {
            marginLeft: 'auto',
        },
        roleText: {
            color: theme.colors.grey,
        },
    })

export default MemberItem
