import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'

import CogIcon from '@fedi/common/assets/svgs/cog.svg'
import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    paginateMatrixRoomTimeline,
    selectGroupPreview,
    selectMatrixRoom,
    selectMatrixRoomEvents,
    sendMatrixMessage,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'
import { RpcMediaUploadParams } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint, writeBridgeFile } from '../../lib/bridge'
import { styled } from '../../styles'
import { getMediaDimensions } from '../../utils/media'
import { Button } from '../Button'
import { HoloLoader } from '../HoloLoader'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { ChatConversation } from './ChatConversation'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatPaymentDialog } from './ChatPaymentDialog'
import { ChatPreviewConversation } from './ChatPreviewConversation'
import { ChatRoomSettingsDialog } from './ChatRoomSettingsDialog'

const log = makeLog('ChatRoomConversation')

interface Props {
    roomId: string
}

export const ChatRoomConversation: React.FC<Props> = ({ roomId }) => {
    const { t } = useTranslation()
    const { back } = useRouter()
    const dispatch = useAppDispatch()
    const { error } = useToast()

    const room = useAppSelector(s => selectMatrixRoom(s, roomId))
    const groupPreview = useAppSelector(s => selectGroupPreview(s, roomId))
    const events = useAppSelector(s => selectMatrixRoomEvents(s, roomId))

    const [isLoading, setIsLoading] = useState(!room)
    const [isPaymentOpen, setIsPaymentOpen] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)

    useObserveMatrixRoom(roomId)

    const directUserId = room?.directUserId

    // If we don't have info about this member, attempt to fetch a pubkey for them
    useEffect(() => {
        if (room) return
        setIsLoading(false)
        // TODO: Fetch the room?
    }, [room])

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

    if (isLoading) {
        return (
            <LoadingContainer>
                <HoloLoader size="xl" />
            </LoadingContainer>
        )
    } else if (!room) {
        if (groupPreview) {
            return (
                <ChatPreviewConversation id={roomId} preview={groupPreview} />
            )
        }

        return (
            <ChatEmptyState>
                <Text>
                    {t('feature.chat.member-not-found', {
                        username: roomId,
                    })}
                </Text>
                <Button onClick={() => back()}>{t('phrases.go-back')}</Button>
            </ChatEmptyState>
        )
    }

    return (
        <>
            <ChatConversation
                type={directUserId ? ChatType.direct : ChatType.group}
                id={room?.id || ''}
                isPublic={room?.isPublic ?? false}
                name={room?.name || ''}
                events={events}
                onSendMessage={handleSend}
                onWalletClick={() => setIsPaymentOpen(true)}
                headerActions={
                    directUserId ? undefined : (
                        <Icon
                            icon={CogIcon}
                            size={26}
                            onClick={() => setIsSettingsOpen(true)}
                        />
                    )
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
