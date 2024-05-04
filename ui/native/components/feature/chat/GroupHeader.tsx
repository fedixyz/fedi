import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import React from 'react'
import { Pressable, StyleSheet } from 'react-native'

import { selectChatGroup } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook, RootStackParamList } from '../../../types/navigation'
import { AvatarSize } from '../../ui/Avatar'
import Header from '../../ui/Header'
import { ChatConnectionBadge } from './ChatConnectionBadge'
import GroupIcon from './GroupIcon'

type GroupChatRouteProp = RouteProp<RootStackParamList, 'GroupChat'>

const GroupHeader: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const route = useRoute<GroupChatRouteProp>()
    const { groupId } = route.params
    const group = useAppSelector(s => selectChatGroup(s, groupId))

    const headerText = group?.name || t('feature.chat.new-group')

    return (
        <>
            <Header
                backButton
                centerContainerStyle={styles(theme).headerCenterContainer}
                headerCenter={
                    <Pressable
                        // if this is a DirectChat, header press is disabled
                        disabled={group === undefined}
                        style={styles(theme).groupNameContainer}
                        onPress={() => {
                            navigation.navigate('GroupAdmin', { groupId })
                        }}>
                        {group && (
                            <GroupIcon chat={group} size={AvatarSize.sm} />
                        )}
                        <Text
                            bold
                            numberOfLines={1}
                            style={styles(theme).groupNameText}>
                            {headerText}
                        </Text>
                    </Pressable>
                }
            />
            <ChatConnectionBadge offset={63} />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        headerCenterContainer: {
            flex: 6,
            alignItems: 'center',
            justifyContent: 'center',
        },
        groupNameText: {
            marginLeft: theme.spacing.sm,
        },
        groupIcon: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
        },
        groupNameContainer: {
            flex: 1,
            padding: theme.spacing.xs,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default GroupHeader
