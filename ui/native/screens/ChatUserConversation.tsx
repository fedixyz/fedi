import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
    selectMatrixAuth,
    selectMatrixDirectMessageRoom,
    sendMatrixDirectMessage,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'

import MessageInput from '../components/feature/chat/MessageInput'
import NoMessagesNotice from '../components/feature/chat/NoMessagesNotice'
import SelectedMessageOverlay from '../components/feature/chat/SelectedMessageOverlay'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToDirectChat } from '../state/navigation'
import type { NavigationHook, RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatUserConversation'
>

const ChatUserConversation: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const { userId } = route.params
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const existingRoom = useAppSelector(s =>
        selectMatrixDirectMessageRoom(s, userId),
    )
    const [isSending, setIsSending] = useState(false)

    const dispatch = useAppDispatch()

    // If this is a chat with ourselves, redirect to main chat screen
    const navigationReplace = navigation.replace
    useEffect(() => {
        if (userId === matrixAuth?.userId) {
            navigationReplace('TabsNavigator')
        }
    }, [userId, matrixAuth, navigationReplace])

    // If we already have a chat room with this user, redirect there
    useEffect(() => {
        if (!existingRoom) return
        navigation.dispatch(resetToDirectChat(existingRoom.id))
    }, [existingRoom, navigation])

    // add another check before creating another room
    const handleSend = useCallback(
        async (body: string) => {
            setIsSending(true)
            const res = await dispatch(
                sendMatrixDirectMessage({ userId, body }),
            ).unwrap()
            navigationReplace('ChatRoomConversation', {
                roomId: res.roomId,
                chatType: ChatType.direct,
            })
            setIsSending(false)
        },
        [dispatch, navigationReplace, userId, setIsSending],
    )

    return (
        <View style={styles(theme).container}>
            <>
                {isSending ? (
                    <View style={styles(theme).center}>
                        <ActivityIndicator size="large" />
                    </View>
                ) : (
                    <NoMessagesNotice />
                )}
                <MessageInput
                    isSending={isSending}
                    onMessageSubmitted={handleSend}
                    id={userId}
                    isPublic={false}
                />
            </>
            <SelectedMessageOverlay isPublic={false} />
        </View>
    )
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
        center: {
            flex: 1,
            justifyContent: 'center',
        },
    })

export default ChatUserConversation
