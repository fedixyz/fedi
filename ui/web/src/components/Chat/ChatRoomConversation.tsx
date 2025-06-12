import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import CogIcon from '@fedi/common/assets/svgs/cog.svg'
import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
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

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'
import { Button } from '../Button'
import { HoloLoader } from '../HoloLoader'
import { IconButton } from '../IconButton'
import { Text } from '../Text'
import { ChatConversation } from './ChatConversation'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatPaymentDialog } from './ChatPaymentDialog'
import { ChatPreviewConversation } from './ChatPreviewConversation'
import { ChatRoomSettingsDialog } from './ChatRoomSettingsDialog'

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
        async (body: string) => {
            await dispatch(
                sendMatrixMessage({ fedimint, roomId, body }),
            ).unwrap()
        },
        [dispatch, roomId],
    )

    const handlePaginate = useCallback(async () => {
        try {
            await dispatch(paginateMatrixRoomTimeline({ roomId })).unwrap()
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
                type={ChatType.direct}
                id={room?.id || ''}
                name={room?.name || ''}
                events={events}
                onSendMessage={handleSend}
                inputActions={
                    directUserId ? (
                        <IconButton
                            size="md"
                            icon={WalletIcon}
                            onClick={() => setIsPaymentOpen(true)}
                        />
                    ) : undefined
                }
                headerActions={
                    directUserId ? undefined : (
                        <IconButton
                            size="md"
                            icon={CogIcon}
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
