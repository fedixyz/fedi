import { useNavigation } from '@react-navigation/native'
import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { FlatList, ListRenderItem, StyleSheet } from 'react-native'

import { ChatMember } from '@fedi/common/types'

import { NavigationHook } from '../../../types/navigation'
import MemberItem from './MemberItem'

type MembersListProps = {
    members: ChatMember[]
}

const MembersList: React.FC<MembersListProps> = ({
    members,
}: MembersListProps) => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const openDirectChat = (member: ChatMember) => {
        navigation.navigate('DirectChat', { memberId: member.id })
    }

    const renderMember: ListRenderItem<ChatMember> = ({ item }) => {
        return <MemberItem member={item} selectMember={openDirectChat} />
    }

    return (
        <FlatList
            data={members}
            renderItem={renderMember}
            keyExtractor={item => `${item.id}`}
            style={styles(theme).container}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default MembersList
