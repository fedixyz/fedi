import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useChatMember } from '@fedi/common/hooks/chat'
import {
    selectChatConnectionOptions,
    selectChatMessages,
} from '@fedi/common/redux'
import { makeMessageGroups } from '@fedi/common/utils/chat'

import MessagesList from '../components/feature/chat/MessagesList'
import { useAppSelector } from '../state/hooks'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'DirectChat'>

/** @deprecated XMPP legacy code */
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

    const messages = useAppSelector(s => selectChatMessages(s, memberId))
    const { member } = useChatMember(memberId)

    const messageCollections = useMemo(
        () => makeMessageGroups(messages, 'desc'),
        [messages],
    )

    let content: React.ReactNode
    if (!member) {
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
