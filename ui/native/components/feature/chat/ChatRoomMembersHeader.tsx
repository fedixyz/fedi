import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import {
    selectMatrixAuth,
    selectMatrixRoomMembersByMe,
} from '@fedi/common/redux'
import { MatrixPowerLevel } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook, RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import { ChatConnectionBadge } from './ChatConnectionBadge'

type ChatRoomMembersRouteProp = RouteProp<RootStackParamList, 'ChatRoomMembers'>

const ChatConversationHeader: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const route = useRoute<ChatRoomMembersRouteProp>()
    const { roomId, displayMultispendRoles } = route.params
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const members = useAppSelector(s => selectMatrixRoomMembersByMe(s, roomId))
    const me = members.find(m => m.id === matrixAuth?.userId)
    const { t } = useTranslation()

    const handleInviteMember = useCallback(() => {
        if (me?.powerLevel === MatrixPowerLevel.Member) return

        navigation.replace('ChatRoomInvite', { roomId })
    }, [navigation, roomId, me])

    const style = useMemo(() => styles(theme), [theme])

    return (
        <>
            <Header
                backButton
                containerStyle={style.container}
                centerContainerStyle={style.headerCenterContainer}
                headerCenter={
                    <Text bold>
                        {displayMultispendRoles
                            ? t('feature.multispend.multispend-group-members')
                            : t('words.members')}
                    </Text>
                }
                headerRight={
                    displayMultispendRoles ? undefined : (
                        <PressableIcon
                            onPress={handleInviteMember}
                            svgName="Plus"
                        />
                    )
                }
            />
            <ChatConnectionBadge offset={40} />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.xs,
        },
        headerLeftContainer: {
            height: theme.sizes.md,
            borderWidth: 1,
        },
        headerCenterContainer: {
            flex: 6,
        },
        memberText: {
            marginLeft: theme.spacing.sm,
        },
        memberContainer: {
            padding: theme.spacing.xs,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        shortIdText: {
            marginLeft: theme.spacing.xs,
        },
    })

export default ChatConversationHeader
