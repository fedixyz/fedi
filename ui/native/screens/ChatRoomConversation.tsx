import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    addPreviewMedia,
    selectGroupPreview,
    selectMatrixRoom,
    sendMatrixMessage,
} from '@fedi/common/redux'
import { ChatType, InputAttachment, InputMedia } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import ChatConversation from '../components/feature/chat/ChatConversation'
import ChatPreviewConversation from '../components/feature/chat/ChatPreviewConversation'
import MessageInput from '../components/feature/chat/MessageInput'
import SelectedMessageOverlay from '../components/feature/chat/SelectedMessageOverlay'
import HoloLoader from '../components/ui/HoloLoader'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ChatRoomConversation')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatRoomConversation'
>

const ChatRoomConversation: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const { roomId, chatType = ChatType.group } = route.params
    const [isSending, setIsSending] = useState(false)
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const groupPreview = useAppSelector(s => selectGroupPreview(s, roomId))
    const toast = useToast()

    const directUserId = useMemo(() => room?.directUserId, [room])

    const handleSend = useCallback(
        async (
            body: string,
            attachments: Array<InputAttachment | InputMedia> = [],
        ) => {
            if ((!body && !attachments.length) || isSending) return

            setIsSending(true)
            try {
                dispatch(
                    addPreviewMedia(attachments.filter(att => 'width' in att)),
                )
                if (body) {
                    await dispatch(
                        sendMatrixMessage({
                            fedimint,
                            roomId,
                            body,
                            // TODO: support intercepting bolt11 for group chats
                            options: { interceptBolt11: chatType === 'direct' },
                        }),
                    ).unwrap()
                }

                for (const att of attachments) {
                    const resolvedUri = decodeURI(att.uri)
                    const filePath = resolvedUri.startsWith('file://')
                        ? resolvedUri.slice(7)
                        : resolvedUri

                    await fedimint.matrixSendAttachment({
                        roomId,
                        filename: att.fileName,
                        params: {
                            mimeType: att.mimeType,
                            width: 'width' in att ? att.width : null,
                            height: 'height' in att ? att.height : null,
                        },
                        filePath,
                    })
                }
            } catch (err) {
                log.error('error sending message', err)
                toast.error(t, 'errors.unknown-error')
            } finally {
                setIsSending(false)
            }
        },
        [chatType, dispatch, isSending, roomId, t, toast],
    )

    const content = useMemo(() => {
        return (
            <>
                <ChatConversation
                    type={chatType}
                    id={roomId || ''}
                    isPublic={room?.isPublic}
                />
                <MessageInput
                    onMessageSubmitted={handleSend}
                    id={roomId || directUserId || ''}
                    isPublic={room?.isPublic}
                />
            </>
        )
    }, [roomId, directUserId, chatType, handleSend, room])

    const style = useMemo(() => styles(theme), [theme])

    if (!room) {
        if (groupPreview) {
            return (
                <ChatPreviewConversation id={roomId} preview={groupPreview} />
            )
        }

        return (
            <View style={style.loader}>
                <HoloLoader size={28} />
            </View>
        )
    }

    return (
        <>
            <View style={style.container}>{content}</View>
            <SelectedMessageOverlay isPublic={!!room.isPublic} />
        </>
    )
}

const styles = (_: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        loader: {
            alignItems: 'center',
        },
    })

export default ChatRoomConversation
