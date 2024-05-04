import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'

import { encodeDirectChatLink } from '@fedi/common/utils/xmpp'

import Avatar, { AvatarSize } from '../../ui/Avatar'
import SvgImage from '../../ui/SvgImage'
import type { OmniMemberSearchListItemType } from './OmniMemberSearchList'

interface Props {
    item: OmniMemberSearchListItemType
    onInput(data: string): void
}

export const OmniMemberSearchItem: React.FC<Props> = ({ item, onInput }) => {
    const { theme } = useTheme()

    if ('loading' in item) {
        return <ActivityIndicator />
    }

    const style = styles(theme)
    return (
        <Pressable
            style={style.searchMember}
            hitSlop={theme.spacing.md}
            onPress={() =>
                onInput(
                    item.inputData
                        ? item.inputData
                        : encodeDirectChatLink(item.id),
                )
            }>
            <Avatar id={item.id} name={item.username} size={AvatarSize.md} />
            <Text numberOfLines={1} style={style.searchMemberText}>
                {item.username}
            </Text>
            <SvgImage name="ChevronRight" />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        searchMember: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
        },
        searchMemberText: {
            flex: 1,
        },
    })
