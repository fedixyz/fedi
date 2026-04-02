import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useConnectionRequestData } from '@fedi/common/hooks/matrix'
import { useMultispendDisplayUtils } from '@fedi/common/hooks/multispend'
import { useToast } from '@fedi/common/hooks/toast'
import {
    addPreviewMedia,
    selectGroupPreview,
    selectMatrixRoom,
    selectShouldShowJoinOnChatPreview,
    sendMatrixMessage,
} from '@fedi/common/redux'
import { ChatType, InputAttachment, InputMedia } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { stripFileUriPrefix } from '@fedi/common/utils/media'

import ChatConversation from '../components/feature/chat/ChatConversation'
import ChatPreviewConversation from '../components/feature/chat/ChatPreviewConversation'
import ConnectionRequestBanner from '../components/feature/chat/ConnectionRequestBanner'
import MessageInput from '../components/feature/chat/MessageInput'
import PinnedMessageBanner from '../components/feature/chat/PinnedMessageBanner'
import SelectedMessageOverlay from '../components/feature/chat/SelectedMessageOverlay'
import MultispendChatBanner from '../components/feature/multispend/MultispendChatBanner'
import { Column } from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'
import {
    useChatKeyboardBehavior,
    useImeFooterLift,
} from '../utils/hooks/keyboard'

const log = makeLog('ChatRoomConversation')
type PinnedScrollRequest = {
    eventId: string
    nonce: number
}

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ChatRoomConversation'
>

const ChatRoomConversation: React.FC<Props> = ({
    route,
    navigation,
}: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { roomId, chatType = ChatType.group } = route.params
    const [isSending, setIsSending] = useState(false)
    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const groupPreview = useAppSelector(s => selectGroupPreview(s, roomId))
    const shouldShowJoinButton = useAppSelector(s =>
        selectShouldShowJoinOnChatPreview(s, roomId),
    )
    const toast = useToast()
    const { shouldShowHeader } = useMultispendDisplayUtils(t, roomId)
    const [replyBarHeight, setReplyBarHeight] = useState(0)
    const [pinnedScrollRequest, setPinnedScrollRequest] =
        useState<PinnedScrollRequest | null>(null)
    const [focusedPinnedEventId, setFocusedPinnedEventId] = useState<
        string | null
    >(null)

    const extraPadAndroid35 = useImeFooterLift()

    const { connectionRequestPending, connectionRequestUsername } =
        useConnectionRequestData(roomId)

    const directUserId = room?.directUserId
    const { bottomOffset, setMessageInputHeight } = useChatKeyboardBehavior()

    const handleJoinPressed = () => {
        navigation.navigate('ConfirmJoinPublicGroup', {
            groupId: roomId,
        })
    }

    const handleSend = useCallback(
        async (
            body: string,
            attachments: Array<InputAttachment | InputMedia> = [],
            repliedEventId?: string,
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
                            repliedEventId,
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
        [chatType, dispatch, isSending, roomId, t, toast, fedimint],
    )

    const handlePinnedBannerPress = useCallback((eventId: string) => {
        setPinnedScrollRequest(prev => ({
            eventId,
            nonce: (prev?.nonce ?? 0) + 1,
        }))
    }, [])

    const style = styles(theme)

    if (!room) {
        if (groupPreview) {
            return (
                <SafeAreaContainer edges="bottom">
                    <Column grow basis={false}>
                        <ChatPreviewConversation
                            id={roomId}
                            preview={groupPreview}
                        />
                        {shouldShowJoinButton && (
                            <Button
                                onPress={handleJoinPressed}
                                containerStyle={style.joinGroupButton}>
                                {t('feature.chat.join-group')}
                            </Button>
                        )}
                    </Column>
                </SafeAreaContainer>
            )
        }

        return (
            <Column align="center">
                <HoloLoader size={28} />
            </Column>
        )
    }

    return (
        <SafeAreaContainer
            edges="bottom"
            style={{ paddingBottom: extraPadAndroid35 }}>
            <Column grow basis={false}>
                {shouldShowHeader && <MultispendChatBanner roomId={roomId} />}
                {connectionRequestPending && (
                    <ConnectionRequestBanner
                        username={connectionRequestUsername}
                        roomId={roomId}
                    />
                )}
                <PinnedMessageBanner
                    roomId={roomId}
                    focusedEventId={focusedPinnedEventId}
                    onPressPinnedMessage={handlePinnedBannerPress}
                />
                <ChatConversation
                    type={chatType}
                    id={roomId || ''}
                    isPublic={room?.isPublic ?? false}
                    newMessageBottomOffset={bottomOffset}
                    replyBarOffset={replyBarHeight}
                    connectionRequestPending={connectionRequestPending}
                    scrollToMessageRequest={pinnedScrollRequest}
                    onScrollToMessageComplete={setFocusedPinnedEventId}
                />
                <MessageInput
                    onMessageSubmitted={handleSend}
                    id={roomId || directUserId || ''}
                    isSending={isSending}
                    isPublic={room?.isPublic ?? false}
                    isDisabled={!!connectionRequestPending}
                    onHeightChanged={setMessageInputHeight}
                    onReplyBarHeightChanged={setReplyBarHeight}
                />
            </Column>
            <SelectedMessageOverlay isPublic={!!room.isPublic} />
        </SafeAreaContainer>
    )
}
const styles = (theme: Theme) =>
    StyleSheet.create({
        joinGroupButton: {
            marginHorizontal: theme.spacing.lg,
        },
    })

export default ChatRoomConversation
