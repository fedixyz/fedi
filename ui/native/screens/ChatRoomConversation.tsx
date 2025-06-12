import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMultispendDisplayUtils } from '@fedi/common/hooks/multispend'
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
import MultispendChatBanner from '../components/feature/multispend/MultispendChatBanner'
import Flex from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'
import { stripFileUriPrefix } from '../utils/media'

const log = makeLog('ChatRoomConversation')

const DEFAULT_NEW_MESSAGE_BOTTOM_OFFSET = 20

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatRoomConversation'
>

const ChatRoomConversation: React.FC<Props> = ({ route }: Props) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { roomId, chatType = ChatType.group } = route.params
    const [isSending, setIsSending] = useState(false)
    const [newMessageBottomOffset, setNewMessageBottomOffset] = useState(
        DEFAULT_NEW_MESSAGE_BOTTOM_OFFSET,
    )
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const groupPreview = useAppSelector(s => selectGroupPreview(s, roomId))
    const toast = useToast()
    const { shouldShowHeader } = useMultispendDisplayUtils(t, roomId)

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
                    const filePath = stripFileUriPrefix(resolvedUri)

                    const width = 'width' in att ? att.width : null
                    const height = 'height' in att ? att.height : null

                    await fedimint.matrixSendAttachment({
                        roomId,
                        filename: att.fileName,
                        params: {
                            mimeType: att.mimeType,
                            width,
                            height,
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
                {shouldShowHeader && <MultispendChatBanner roomId={roomId} />}
                <ChatConversation
                    type={chatType}
                    id={roomId || ''}
                    isPublic={room?.isPublic}
                    newMessageBottomOffset={newMessageBottomOffset}
                />
                <MessageInput
                    onMessageSubmitted={handleSend}
                    id={roomId || directUserId || ''}
                    isPublic={room?.isPublic}
                    onHeightChanged={height =>
                        setNewMessageBottomOffset(
                            DEFAULT_NEW_MESSAGE_BOTTOM_OFFSET + height,
                        )
                    }
                />
            </>
        )
    }, [
        roomId,
        directUserId,
        chatType,
        handleSend,
        room,
        newMessageBottomOffset,
        shouldShowHeader,
    ])

    if (!room) {
        if (groupPreview) {
            return (
                <ChatPreviewConversation id={roomId} preview={groupPreview} />
            )
        }

        return (
            <Flex align="center">
                <HoloLoader size={28} />
            </Flex>
        )
    }

    return (
        <>
            <Flex grow basis={false}>
                {content}
            </Flex>
            <SelectedMessageOverlay isPublic={!!room.isPublic} />
        </>
    )
}

export default ChatRoomConversation
