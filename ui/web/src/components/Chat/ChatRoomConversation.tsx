import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'

import CogIcon from '@fedi/common/assets/svgs/cog.svg'
import SearchIcon from '@fedi/common/assets/svgs/search.svg'
import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    getMatrixRoomPreview,
    paginateMatrixRoomTimeline,
    selectGroupPreview,
    selectMatrixRoom,
    selectMatrixRoomEvents,
    sendMatrixMessage,
    selectShouldShowJoinOnChatPreview,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'
import { RpcMediaUploadParams } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import {
    chatRoute,
    chatConfirmJoinPublicRoomRoute,
} from '../../constants/routes'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint, writeBridgeFile } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { getMediaDimensions } from '../../utils/media'
import { Button } from '../Button'
import { Column, Row } from '../Flex'
import { HoloLoader } from '../HoloLoader'
import { Icon } from '../Icon'
import { ChatConversation } from './ChatConversation'
import { ChatPaymentDialog } from './ChatPaymentDialog'
import { ChatPreviewConversation } from './ChatPreviewConversation'
import { ChatRoomSearch } from './ChatRoomSearch'
import { ChatRoomSettingsDialog } from './ChatRoomSettingsDialog'

const log = makeLog('ChatRoomConversation')

interface Props {
    roomId: string
}

export const ChatRoomConversation: React.FC<Props> = ({ roomId }) => {
    const { t } = useTranslation()
    const { query, push, replace } = useRouter()
    const dispatch = useAppDispatch()
    const { error } = useToast()

    const [, , chatSubpath] = Array.isArray(query.path)
        ? [query.path[0], query.path[1], query.path[2]]
        : []

    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const groupPreview = useAppSelector(s => selectGroupPreview(s, roomId))
    const events = useAppSelector(s => selectMatrixRoomEvents(s, roomId))
    const shouldShowJoinButton = useAppSelector(s =>
        selectShouldShowJoinOnChatPreview(s, roomId),
    )

    const [isPaymentOpen, setIsPaymentOpen] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)

    useObserveMatrixRoom(roomId)

    const directUserId = room?.directUserId
    const isDirectChat = room?.isDirect

    useEffect(() => {
        if (room || groupPreview) return

        let isCancelled = false
        const previewRequest = dispatch(
            getMatrixRoomPreview({ fedimint, roomId }),
        )

        previewRequest.unwrap().catch(err => {
            if (isCancelled) return

            log.warn('Failed to fetch room preview', err)
            replace(chatRoute)
        })

        return () => {
            isCancelled = true
            previewRequest.abort()
        }
    }, [dispatch, groupPreview, replace, room, roomId])

    const handleSend = useCallback(
        async (
            body: string,
            files: File[] = [],
            repliedEventId?: string | null,
        ) => {
            try {
                if (body) {
                    await dispatch(
                        sendMatrixMessage({
                            fedimint,
                            roomId,
                            body,
                            repliedEventId: repliedEventId ?? undefined,
                        }),
                    ).unwrap()
                }

                for (const file of files) {
                    const { name, type } = file

                    const isMedia =
                        file.type.startsWith('image/') ||
                        file.type.startsWith('video/')

                    const params: RpcMediaUploadParams = {
                        width: null,
                        height: null,
                        mimeType: type,
                    }

                    if (isMedia) {
                        const { width, height } = await getMediaDimensions(file)
                        params.width = width
                        params.height = height
                    }

                    const extension = name.split('.').pop()
                    const filename = isMedia ? `${uuidv4()}.${extension}` : name

                    await writeBridgeFile(
                        filename,
                        new Uint8Array(await file.arrayBuffer()),
                    )

                    await fedimint.matrixSendAttachment({
                        roomId,
                        filename: filename,
                        params,
                        filePath: filename,
                    })
                }
            } catch (err) {
                log.error('error sending message', err)
                error(t, 'errors.unknown-error')
            }
        },
        [dispatch, error, roomId, t],
    )

    const handlePaginate = useCallback(async () => {
        try {
            await dispatch(
                paginateMatrixRoomTimeline({ fedimint, roomId }),
            ).unwrap()
        } catch (err) {
            error(t, 'errors.unknown-error')
        }
    }, [dispatch, roomId, error, t])

    const handleSearch = useCallback(() => {
        push(`/chat/room/${roomId}/search`)
    }, [push, roomId])

    if (chatSubpath === 'search' && room) {
        return <ChatRoomSearch room={room} />
    }

    if (!room) {
        if (groupPreview) {
            return (
                <Column grow basis={false}>
                    <ChatPreviewConversation
                        id={roomId}
                        preview={groupPreview}
                    />
                    {shouldShowJoinButton && (
                        <JoinButtonWrapper>
                            <Button
                                width="full"
                                onClick={() =>
                                    push(chatConfirmJoinPublicRoomRoute(roomId))
                                }>
                                {t('feature.chat.join-group')}
                            </Button>
                        </JoinButtonWrapper>
                    )}
                </Column>
            )
        }

        return (
            <LoadingContainer>
                <HoloLoader size="md" />
            </LoadingContainer>
        )
    }

    return (
        <>
            <ChatConversation
                type={isDirectChat ? ChatType.direct : ChatType.group}
                id={room?.id || ''}
                isPublic={room?.isPublic ?? false}
                name={room?.name || ''}
                events={events}
                onSendMessage={handleSend}
                onWalletClick={() => setIsPaymentOpen(true)}
                headerActions={
                    <Row gap="sm" align="center">
                        <Icon
                            icon={SearchIcon}
                            size={26}
                            onClick={handleSearch}
                        />
                        {directUserId ? undefined : (
                            <Icon
                                icon={CogIcon}
                                size={26}
                                onClick={() => setIsSettingsOpen(true)}
                            />
                        )}
                    </Row>
                }
                onPaginate={handlePaginate}
            />
            {directUserId ? (
                <ChatPaymentDialog
                    roomId={room.id}
                    recipientId={directUserId}
                    open={isPaymentOpen}
                    onOpenChange={setIsPaymentOpen}
                />
            ) : (
                <ChatRoomSettingsDialog
                    room={room}
                    open={isSettingsOpen}
                    onOpenChange={setIsSettingsOpen}
                />
            )}
        </>
    )
}

const LoadingContainer = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
})

const JoinButtonWrapper = styled('div', {
    background: theme.colors.white,
    padding: theme.spacing.xl,
})
