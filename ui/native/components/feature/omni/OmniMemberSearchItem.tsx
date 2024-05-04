import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'

import { encodeFediMatrixUserUri } from '@fedi/common/utils/matrix'

import SvgImage from '../../ui/SvgImage'
import ChatUserTile from '../chat/ChatUserTile'
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
        <ChatUserTile
            containerStyle={style.searchMember}
            user={item}
            showSuffix
            selectUser={() =>
                onInput(
                    item.inputData
                        ? item.inputData
                        : encodeFediMatrixUserUri(item.id),
                )
            }
            rightIcon={<SvgImage name="ChevronRight" />}
        />
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
    })
