import { useIsFocused, useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme, Text } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
    useChatMember,
    useUpdateLastMessageRead,
} from '@fedi/common/hooks/chat'
import {
    selectActiveFederationId,
    selectAuthenticatedMember,
    selectChatConnectionOptions,
    selectChatMessages,
    sendDirectMessage,
} from '@fedi/common/redux'
import { makeMessageGroups } from '@fedi/common/utils/chat'

import { fedimint } from '../bridge'
import MessageInput from '../components/feature/chat/MessageInput'
import MessagesList from '../components/feature/chat/MessagesList'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'DirectChat'>

const DirectChat: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    // Check for missing domain in case we scan an old member QR and update
    // the route param so we only have to do this once
    const { memberId } = route.params
    const connectionOptions = useAppSelector(selectChatConnectionOptions)
    useEffect(() => {
        if (memberId && !memberId.includes('@') && connectionOptions) {
            const { domain } = connectionOptions
            const fullMemberId = `${memberId}@${domain}`
            navigation.setParams({
                memberId: fullMemberId,
            })
        }
    }, [memberId, connectionOptions, navigation])

    const isFocused = useIsFocused()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const messages = useAppSelector(s => selectChatMessages(s, memberId))
    const { member, isFetchingMember } = useChatMember(memberId)

    const messageCollections = useMemo(
        () => makeMessageGroups(messages, 'desc'),
        [messages],
    )

    // Use these hooks only if the screen is in focus, otherwise use pauseUpdates
    useUpdateLastMessageRead(memberId, messages, isFocused !== true)

    const handleSend = useCallback(
        async (messageText: string) => {
            // If the memberId is not stored, then we have failed to fetch the pubkey
            // and cannot send messages
            if (!member) throw new Error('errors.chat-member-not-found')
            await dispatch(
                sendDirectMessage({
                    fedimint,
                    federationId: activeFederationId as string,
                    recipientId: memberId,
                    content: messageText,
                }),
            ).unwrap()
        },
        [activeFederationId, dispatch, member, memberId],
    )

    useEffect(() => {
        if (memberId === authenticatedMember?.id) {
            navigation.navigate('TabsNavigator')
        }
    }, [memberId, authenticatedMember?.id, navigation])

    let content: React.ReactNode
    if (isFetchingMember) {
        content = <ActivityIndicator />
    } else if (!member) {
        const username = memberId.split('@')[0]
        content = (
            <Text style={styles(theme).centeredText}>
                {t('feature.chat.member-not-found', { username })}
            </Text>
        )
    } else {
        content = (
            <>
                <MessagesList messages={messageCollections} />
                <MessageInput
                    onMessageSubmitted={handleSend}
                    memberId={memberId}
                />
            </>
        )
    }

    return <View style={styles(theme).container}>{content}</View>
}

const styles = (_: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        centeredText: {
            textAlign: 'center',
        },
    })

export default DirectChat
