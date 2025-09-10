import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    selectMatrixAuth,
    selectMatrixDirectMessageRoom,
    sendMatrixDirectMessage,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import MessageInput from '../components/feature/chat/MessageInput'
import NoMessagesNotice from '../components/feature/chat/NoMessagesNotice'
import SelectedMessageOverlay from '../components/feature/chat/SelectedMessageOverlay'
import Flex from '../components/ui/Flex'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { resetToDirectChat } from '../state/navigation'
import { InputAttachment, InputMedia } from '../types'
import type { NavigationHook, RootStackParamList } from '../types/navigation'
import { useImeFooterLift } from '../utils/hooks/keyboard'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatUserConversation'
>

const log = makeLog('ChatUserConversation')

const ChatUserConversation: React.FC<Props> = ({ route }: Props) => {
    const navigation = useNavigation<NavigationHook>()

    const { userId } = route.params
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const existingRoom = useAppSelector(s =>
        selectMatrixDirectMessageRoom(s, userId),
    )
    const [isSending, setIsSending] = useState(false)
    const insets = useSafeAreaInsets()
    const extraPadAndroid35 = useImeFooterLift({
        insetsBottom: insets.bottom,
        buffer: 20,
    })

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
        async (
            body: string,
            attachments?: Array<InputAttachment | InputMedia>,
            repliedEventId?: string | null,
        ) => {
            setIsSending(true)
            try {
                await dispatch(
                    sendMatrixDirectMessage({
                        fedimint,
                        userId,
                        body,
                        repliedEventId,
                    }),
                ).unwrap()
            } catch (err) {
                log.error('error sending direct message', err)
            } finally {
                setIsSending(false)
            }
        },
        [dispatch, userId],
    )

    const renderMessageInput = useCallback((): JSX.Element => {
        const messageInput = (
            <MessageInput
                isSending={isSending}
                onMessageSubmitted={handleSend}
                id={userId}
                isPublic={false}
            />
        )

        return messageInput
    }, [handleSend, isSending, userId])

    return (
        <>
            <Flex
                grow
                basis={false}
                align="stretch"
                style={{ paddingBottom: extraPadAndroid35 }}>
                {isSending ? (
                    <Flex grow justify="center">
                        <ActivityIndicator size="large" />
                    </Flex>
                ) : (
                    <NoMessagesNotice />
                )}
                {renderMessageInput()}
            </Flex>
            <SelectedMessageOverlay isPublic={false} />
        </>
    )
}

export default ChatUserConversation
