import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
    selectActiveFederation,
    selectActiveFederationChats,
} from '@fedi/common/redux'
import { ChatType, MatrixRoom } from '@fedi/common/types'
import { getFederationGroupChats } from '@fedi/common/utils/FederationUtils'

import { useAppSelector } from '../../../state/hooks'
import CommunityChatTile from './CommunityChatTile'

const CommunityChats = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()
    const style = styles(theme)
    const activeFederation = useAppSelector(selectActiveFederation)
    const defaultChats = useAppSelector(s => selectActiveFederationChats(s))
    const expectedNumberOfDefaultChats = activeFederation
        ? getFederationGroupChats(activeFederation.meta).length
        : 0
    const [hasTimedOut, setHasTimedOut] = useState(false)
    const hasWallet = activeFederation?.hasWallet

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

    if (!activeFederation) return null

    if (
        expectedNumberOfDefaultChats === 0 ||
        (hasTimedOut && defaultChats.length === 0)
    )
        return null

    return (
        <View style={style.container}>
            <Text style={style.sectionTitle}>
                {!hasWallet
                    ? t('feature.chat.community-news')
                    : t('feature.chat.federation-news')}
            </Text>
            {chats.map((chat: MatrixRoom | undefined, idx) => (
                <CommunityChatTile
                    key={`chat-tile-${idx}`}
                    room={chat}
                    onSelect={handleOpenChat}
                />
            ))}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: { gap: theme.spacing.sm, width: '100%' },
        sectionTitle: {
            color: theme.colors.night,
            letterSpacing: -0.16,
            fontSize: 20,
            marginBottom: 4,
        },
        servicesSelected: {
            fontFamily: 'Albert Sans',
            fontWeight: '400',
            fontSize: 14,
            lineHeight: 18,
            color: theme.colors.darkGrey,
            letterSpacing: -0.14,
            marginBottom: 12,
        },
    })

export default CommunityChats
