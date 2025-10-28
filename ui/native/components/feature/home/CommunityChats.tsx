import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import {
    selectLastSelectedCommunityChats,
    selectLastSelectedCommunity,
} from '@fedi/common/redux'
import { ChatType, MatrixRoom } from '@fedi/common/types'
import { getDefaultGroupChats } from '@fedi/common/utils/FederationUtils'

import { useAppSelector } from '../../../state/hooks'
import { Column } from '../../ui/Flex'
import DefaultChatTile from './DefaultChatTile'

const CommunityChats = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()
    const style = styles(theme)
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)
    const defaultChats = useAppSelector(s =>
        selectLastSelectedCommunityChats(s),
    )
    const expectedNumberOfDefaultChats = selectedCommunity
        ? getDefaultGroupChats(selectedCommunity.meta).length
        : 0
    const [hasTimedOut, setHasTimedOut] = useState(false)

    useEffect(() => {
        // After 3s, we assume the loading chats have timed out
        // TODO: Add real error handling for previewing default chats
        const timeout = setTimeout(() => {
            setHasTimedOut(true)
        }, 3000)
        return () => clearTimeout(timeout)
    }, [defaultChats, expectedNumberOfDefaultChats])

    const handleOpenChat = useCallback(
        (chat: MatrixRoom) => {
            navigation.navigate('ChatRoomConversation', {
                roomId: chat.id,
                chatType: chat.directUserId ? ChatType.direct : ChatType.group,
            })
        },
        [navigation],
    )

    // If we have fewer default chats than expected,
    // Assume we're loading and fill the gaps with undefined
    const chats = useMemo(
        () =>
            hasTimedOut || defaultChats.length === expectedNumberOfDefaultChats
                ? defaultChats
                : [
                      ...defaultChats,
                      ...new Array(
                          expectedNumberOfDefaultChats - defaultChats.length,
                      ).fill(undefined),
                  ],
        [defaultChats, expectedNumberOfDefaultChats, hasTimedOut],
    )

    if (!selectedCommunity) return null

    if (
        expectedNumberOfDefaultChats === 0 ||
        (hasTimedOut && defaultChats.length === 0)
    )
        return null

    return (
        <Column gap="sm" fullWidth>
            <Text bold style={style.sectionTitle}>
                {t('feature.chat.community-news')}
            </Text>
            {chats.map((chat: MatrixRoom | undefined, idx) => (
                <DefaultChatTile
                    key={`chat-tile-${idx}`}
                    room={chat}
                    onSelect={handleOpenChat}
                />
            ))}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        sectionTitle: {
            color: theme.colors.primary,
            fontSize: 20,
            marginBottom: 4,
        },
        servicesSelected: {
            color: theme.colors.primaryLight,
            marginBottom: 12,
        },
    })

export default CommunityChats
