import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import { useDebouncedEffect } from '@fedi/common/hooks/util'
import {
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixUser,
    selectMatrixRoomEvents,
} from '@fedi/common/redux'
import { ChatType } from '@fedi/common/types'
import { makeChatConversationRows } from '@fedi/common/utils/chatConversationRows'
import {
    isJoinedRoomMemberEvent,
    isRoomMemberEvent,
    makeMatrixReactionChips,
} from '@fedi/common/utils/matrix'

import { useAppSelector, useDeviceQuery } from '../../hooks'
import { styled, theme } from '../../styles'
import { getHashParams } from '../../utils/linking'
import { Avatar } from '../Avatar'
import { CircularLoader } from '../CircularLoader'
import * as Layout from '../Layout'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'
import { ChatConversationEventRow } from './ChatConversationEventRow'
import { ChatReactionDetailsDrawer } from './ChatReactionDetailsDrawer'
import { MatrixReactionEmojiPickerDrawer } from './MatrixReactionEmojiPickerDrawer'
import { MessageInput } from './MessageInput'
import { useMatrixReactionHandler } from './useMatrixReactionHandler'

const HIGHLIGHT_DURATION = 3000
const PAGINATION_THRESHOLD_PX = 80

interface Props {
    type: ChatType
    id: string
    name: string
    headerActions?: React.ReactElement
    onWalletClick?(): void
    onSendMessage(
        message: string,
        files: File[],
        repliedEventId?: string | null,
    ): Promise<void>
}

export const ChatConversation: React.FC<Props> = ({
    type,
    id,
    name,
    headerActions,
    onSendMessage,
    onWalletClick,
}) => {
    const router = useRouter()
    const params = getHashParams(router.asPath)
    const scrollToMessageId = params.message

    const room = useAppSelector(s => selectMatrixRoom(s, id))
    const user = useAppSelector(s => selectMatrixUser(s, id))
    const events = useAppSelector(s => selectMatrixRoomEvents(s, id))
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const [height, setHeight] = useState<number>()
    const [highlightedMessageId, setHighlightedMessageId] = useState<
        string | null
    >(null)
    const [emojiPickerEventId, setEmojiPickerEventId] = useState<string | null>(
        null,
    )
    const [selectedReaction, setSelectedReaction] = useState<{
        eventId: string
        reactionKey: string
    } | null>(null)
    const {
        isPaginating,
        canPaginateFurther,
        paginationStatus,
        handlePaginate,
    } = useObserveMatrixRoom(id)

    const messagesRef = useRef<HTMLDivElement>(null)
    const chatWrapperRef = useRef<HTMLDivElement>(null)
    const hasPaginatedAtBoundaryRef = useRef(false)
    const paginationPendingRef = useRef(false)

    const { isIOS } = useDeviceQuery()
    const { handleReaction, reactingEmoji } = useMatrixReactionHandler()

    const visibleEvents = useMemo(
        () =>
            events.filter(event => {
                if (!isRoomMemberEvent(event)) return true
                return type === ChatType.group && isJoinedRoomMemberEvent(event)
            }),
        [events, type],
    )
    const chatRows = useMemo(
        () => makeChatConversationRows(visibleEvents, type),
        [visibleEvents, type],
    )
    const emojiPickerEvent =
        events.find(event => event.id === emojiPickerEventId) || null
    const selectedReactionEvent =
        events.find(event => event.id === selectedReaction?.eventId) || null
    const selectedReactionChips = makeMatrixReactionChips(
        selectedReactionEvent?.reactions,
        matrixAuth?.userId,
    )

    const handleReactionDetailsToggle = useCallback(
        async (reactionKey: string) => {
            if (!selectedReactionEvent) return

            const reaction = selectedReactionChips.find(
                chip => chip.key === reactionKey,
            )
            const didToggle = await handleReaction({
                event: selectedReactionEvent,
                reactionKey,
                onSuccess: () => setEmojiPickerEventId(null),
            })
            if (!didToggle) return

            if (
                !reaction ||
                (selectedReactionChips.length === 1 && reaction.count <= 1)
            ) {
                setSelectedReaction(null)
                return
            }

            if (reaction.count <= 1) {
                const nextReactionKey = selectedReactionChips.find(
                    chip => chip.key !== reactionKey,
                )?.key

                setSelectedReaction({
                    eventId: selectedReactionEvent.id,
                    reactionKey: nextReactionKey || reactionKey,
                })
            }
        },
        [handleReaction, selectedReactionChips, selectedReactionEvent],
    )

    // this useEffect is required to handle
    // an Android only UI bug that causes the keyboard
    // to overlap the textarea after sending messages
    // and using multiline messages
    useEffect(() => {
        if (isIOS) return

        const update = () =>
            setHeight(window.visualViewport?.height || window.innerHeight)

        window.visualViewport?.addEventListener('resize', update)
        return () =>
            window.visualViewport?.removeEventListener('resize', update)
    }, [isIOS])

    const scrollToMessage = useCallback((eventId: string) => {
        const messageElement = messagesRef.current?.querySelector(
            `[data-event-id="${eventId}"]`,
        )

        if (messageElement) {
            messageElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            })

            setHighlightedMessageId(eventId)
            setTimeout(() => setHighlightedMessageId(null), HIGHLIGHT_DURATION)
        }
    }, [])

    useDebouncedEffect(
        () => {
            if (
                scrollToMessageId &&
                highlightedMessageId !== scrollToMessageId
            ) {
                scrollToMessage(scrollToMessageId)
            }
        },
        [scrollToMessageId, chatRows.length],
        300,
    )

    const handleMessagesScroll = useCallback(
        (ev: React.UIEvent<HTMLDivElement>) => {
            if (!paginationStatus || !canPaginateFurther) return
            const { clientHeight, scrollHeight } = ev.currentTarget
            const scrollTop = Math.abs(ev.currentTarget.scrollTop)

            const isAtPaginationBoundary =
                scrollTop + clientHeight + PAGINATION_THRESHOLD_PX >
                scrollHeight

            if (!isAtPaginationBoundary) {
                hasPaginatedAtBoundaryRef.current = false
                return
            }

            if (
                isPaginating ||
                paginationPendingRef.current ||
                hasPaginatedAtBoundaryRef.current
            ) {
                return
            }

            hasPaginatedAtBoundaryRef.current = true
            paginationPendingRef.current = true
            handlePaginate()
                .catch(() => null)
                .finally(() => {
                    paginationPendingRef.current = false
                })
        },
        [canPaginateFurther, handlePaginate, isPaginating, paginationStatus],
    )

    let avatar: React.ReactNode
    if (room) {
        avatar = <ChatAvatar room={room} size="sm" />
    } else if (user) {
        avatar = <ChatAvatar user={user} size="sm" />
    } else {
        avatar = <Avatar size="sm" id={id} name={name} />
    }

    return (
        <ChatWrapper ref={chatWrapperRef} style={{ height: height ?? '100%' }}>
            <HeaderWrapper back="/chat" rightComponent={headerActions}>
                <HeaderContent>
                    {avatar}
                    <HeaderText weight="medium">{name}</HeaderText>
                </HeaderContent>
            </HeaderWrapper>
            <ContentWrapper>
                <MessagesWrapper
                    data-testid="chat-messages"
                    ref={messagesRef}
                    onScroll={
                        paginationStatus && canPaginateFurther
                            ? handleMessagesScroll
                            : undefined
                    }>
                    {chatRows.map(row => (
                        <ChatConversationEventRow
                            key={row.event.id}
                            roomId={id}
                            {...row}
                            highlightedMessageId={highlightedMessageId}
                            onReplyTap={scrollToMessage}
                            onAddReaction={event =>
                                setEmojiPickerEventId(event.id)
                            }
                            onReactionPress={(event, reactionKey) =>
                                setSelectedReaction({
                                    eventId: event.id,
                                    reactionKey,
                                })
                            }
                        />
                    ))}
                    <PaginationPlaceholder>
                        {isPaginating && <CircularLoader />}
                    </PaginationPlaceholder>
                </MessagesWrapper>
            </ContentWrapper>
            <MessageInput
                type={type}
                id={id}
                onWalletClick={onWalletClick}
                onMessageSubmitted={onSendMessage}
            />
            {selectedReactionEvent && (
                <ChatReactionDetailsDrawer
                    event={selectedReactionEvent}
                    reactions={selectedReactionChips}
                    selectedReactionKey={selectedReaction?.reactionKey || null}
                    onSelectReaction={reactionKey =>
                        setSelectedReaction({
                            eventId: selectedReactionEvent.id,
                            reactionKey,
                        })
                    }
                    onToggleReaction={handleReactionDetailsToggle}
                    onDismiss={() => setSelectedReaction(null)}
                />
            )}
            {emojiPickerEvent && (
                <MatrixReactionEmojiPickerDrawer
                    event={emojiPickerEvent}
                    open={emojiPickerEvent.canReact}
                    pendingReaction={reactingEmoji}
                    onOpenChange={open => {
                        if (!open) setEmojiPickerEventId(null)
                    }}
                    onSelect={reactionKey =>
                        handleReaction({
                            event: emojiPickerEvent,
                            reactionKey,
                            onSuccess: () => setEmojiPickerEventId(null),
                        })
                    }
                />
            )}
        </ChatWrapper>
    )
}

const ChatWrapper = styled('div', {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
})

const HeaderWrapper = styled(Layout.Header, {
    position: 'relative',
})

const HeaderContent = styled('div', {
    display: 'flex',
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    maxWidth: '70%',
    margin: 'auto',
})

const HeaderText = styled(Text, {
    maxWidth: '80%',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
})

const ContentWrapper = styled(Layout.Content, {})

const MessagesWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column-reverse',
    flex: 1,
    minHeight: 0,
    gap: 6,
    overflowY: 'auto',
    padding: 16,
})

const PaginationPlaceholder = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 60,
    flexShrink: 0,
    color: theme.colors.grey,
})
