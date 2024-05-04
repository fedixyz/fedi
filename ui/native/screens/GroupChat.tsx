import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectChatGroup, selectChatMessages } from '@fedi/common/redux'
import { makeMessageGroups } from '@fedi/common/utils/chat'

import MessagesList from '../components/feature/chat/MessagesList'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>

/** @deprecated XMPP legacy code */
const GroupChat: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { groupId } = route.params
    const group = useAppSelector(s => selectChatGroup(s, groupId))
    const messages = useAppSelector(s => selectChatMessages(s, groupId))

    const messageCollections = useMemo(
        () => makeMessageGroups(messages, 'desc'),
        [messages],
    )

    if (!group) {
        return (
            <View style={styles(theme).container}>
                <View style={styles(theme).errorMessage}>
                    <SvgImage size={SvgImageSize.md} name="ScanSad" />
                    <Text>{t('feature.chat.invalid-group')}</Text>
                    <Button onPress={() => navigation.goBack()}>
                        {t('phrases.go-back')}
                    </Button>
                </View>
            </View>
        )
    }

    return (
        <View style={styles(theme).container}>
            <MessagesList messages={messageCollections} multiUserChat />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        noticeText: {
            textAlign: 'center',
            padding: theme.spacing.xl,
            color: theme.colors.primaryLight,
            width: '70%',
        },
        errorMessage: {
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: theme.spacing.lg,
        },
    })

export default GroupChat
