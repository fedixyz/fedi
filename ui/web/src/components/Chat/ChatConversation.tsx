import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import PlusIcon from '@fedi/common/assets/svgs/plus.svg'
import SendArrowUpCircleIcon from '@fedi/common/assets/svgs/send-arrow-up-circle.svg'
import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
import { useMentionInput } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { useDebouncedEffect } from '@fedi/common/hooks/util'
import {
    selectMatrixRoom,
    selectMatrixRoomIsReadOnly,
    selectMatrixUser,
    selectReplyingToMessageEventForRoom,
    clearChatReplyingToMessage,
    selectMatrixRoomMembers,
    selectMatrixAuth,
    selectChatDrafts,
    setChatDraft,
} from '@fedi/common/redux'
import {
    ChatType,
    MatrixEvent,
    MentionSelect,
    MatrixRoomMember,
} from '@fedi/common/types'
import { RpcMatrixMembership } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'
import {
    makeMatrixEventGroups,
    stripReplyFromBody,
    matrixIdToUsername,
} from '@fedi/common/utils/matrix'

import {
    useAppDispatch,
    useAppSelector,
    useAutosizeTextArea,
    useDeviceQuery,
} from '../../hooks'
import { styled, theme } from '../../styles'
import { Avatar } from '../Avatar'
import { CircularLoader } from '../CircularLoader'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'
import { ChatAttachmentThumbnail } from './ChatAttachmentThumbnail'
import { ChatAvatar } from './ChatAvatar'
import { ChatEventCollection } from './ChatEventCollection'
import ChatMentionSuggestions from './ChatMentionSuggestions'

const log = makeLog('ChatConversation')
const HIGHLIGHT_DURATION = 3000

interface Props {
    type: ChatType
    id: string
    name: string
    events: MatrixEvent[]
    isPublic?: boolean
    headerActions?: React.ReactNode
    onWalletClick?(): void
    onPaginate?: () => Promise<void>

    inputActions?: React.ReactNode
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
    events,
    headerActions,
    inputActions,
    onSendMessage,
    isPublic,
    onWalletClick,
    onPaginate,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()

    const room = useAppSelector(s => selectMatrixRoom(s, id))
    const user = useAppSelector(s => selectMatrixUser(s, id))
    const isReadOnly = useAppSelector(s => selectMatrixRoomIsReadOnly(s, id))
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, id))
    const auth = useAppSelector(s => selectMatrixAuth(s))
    const drafts = useAppSelector(s => selectChatDrafts(s))
    const selfUserId = auth?.userId || undefined

    const [value, setValue] = useState(drafts?.[id] ?? '')
    const [isSending, setIsSending] = useState(false)
    const [hasPaginated, setHasPaginated] = useState(false)
    const [isPaginating, setIsPaginating] = useState(false)
    const [files, setFiles] = useState<File[]>([])
    const [cursor, setCursor] = useState(0)
    const [height, setHeight] = useState<number>()

    const repliedEvent = useAppSelector(s =>
        selectReplyingToMessageEventForRoom(s, id),
    )
    const [highlightedMessageId, setHighlightedMessageId] = useState<
        string | null
    >(null)

    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const messagesRef = useRef<HTMLDivElement>(null)
    const chatWrapperRef = useRef<HTMLDivElement>(null)

    useAutosizeTextArea(inputRef.current, value)
    const { isIOS } = useDeviceQuery()

    const mentionEnabled = type === ChatType.group && (!!room || !!isPublic)
    const membersForMentions = useMemo<MatrixRoomMember[]>(() => {
        if (!mentionEnabled) return []
        const list = (roomMembers || []) as MatrixRoomMember[]
        if (!selfUserId) return list
        if (list.some(m => m.id === selfUserId)) return list
        const displayName =
            (auth?.displayName || '').trim() || matrixIdToUsername(selfUserId)
        const selfAsMember: MatrixRoomMember = {
            id: selfUserId,
            displayName,
            avatarUrl: auth?.avatarUrl,
            powerLevel: 0,
            roomId: id,
            membership: 'join' as RpcMatrixMembership,
            ignored: false,
        }
        return [...list, selfAsMember]
    }, [
        mentionEnabled,
        roomMembers,
        selfUserId,
        auth?.displayName,
        auth?.avatarUrl,
        id,
    ])

    const {
        mentionSuggestions,
        shouldShowSuggestions,
        detectMentionTrigger,
        insertMention: insertMentionFromHook,
    } = useMentionInput(membersForMentions, cursor)

    const showMentionSuggestions =
        mentionEnabled && !isReadOnly && shouldShowSuggestions

    const eventGroups = useMemo(
        () => makeMatrixEventGroups(events, 'desc'),
        [events],
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

    useEffect(() => {
        setHasPaginated(false)
    }, [events.length])

    useEffect(() => {
        if (!onPaginate) return
        setIsPaginating(true)
        setHasPaginated(true)
        onPaginate()
            .catch(() => null)
            .finally(() => setIsPaginating(false))
    }, [onPaginate])

    useDebouncedEffect(
        () => {
            // TODO: make sure to not set draft when editing a message (when editing is implemented in `web`
            dispatch(setChatDraft({ roomId: id, text: value }))
        },
        [value, dispatch, id],
        500,
    )

    const scrollToMessage = useCallback((eventId: string) => {
        try {
            const messageElement = messagesRef.current?.querySelector(
                `[data-event-id="${eventId}"]`,
            )

            if (messageElement) {
                messageElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                })

                setHighlightedMessageId(eventId)
                setTimeout(
                    () => setHighlightedMessageId(null),
                    HIGHLIGHT_DURATION,
                )
            }
        } catch (error) {
            log.error('Error scrolling to message:', error)
        }
    }, [])

    const handleMessagesScroll = useCallback(
        (ev: React.WheelEvent<HTMLDivElement>) => {
            if (!onPaginate) return
            const { clientHeight, scrollHeight } = ev.currentTarget
            const scrollTop = Math.abs(ev.currentTarget.scrollTop)
            if (scrollTop + clientHeight + 80 > scrollHeight) {
                setIsPaginating(true)
                setHasPaginated(true)
                onPaginate()
                    .catch(() => null)
                    .finally(() => setIsPaginating(false))
            }
        },
        [onPaginate],
    )

    const handleSend = useCallback(
        async (ev?: React.FormEvent) => {
            if (ev) {
                ev.preventDefault()
            }

            if (!value.trim() && !files.length) return

            try {
                setIsSending(true)
                await onSendMessage(value, files, repliedEvent?.id ?? null)
                setValue('')
                setFiles([])
                if (repliedEvent) {
                    dispatch(clearChatReplyingToMessage())
                }
            } catch (err) {
                toast.error(t, err, 'errors.chat-connection-unhealthy')
            } finally {
                setIsSending(false)
            }
        },
        [onSendMessage, value, files, repliedEvent, dispatch, toast, t],
    )

    const handleOnMediaClick = () => {
        if (!fileRef.current) return
        fileRef.current?.click()
    }

    const handleOnUploadMedia = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        if (!event.target.files || !event.target.files.length) return
        const filesArr = Array.from(event.target.files)
        setFiles(prev => [...prev, ...filesArr])
    }

    const handleOnRemoveThumbnail = (idx: number) => {
        const newFiles = [...files.slice(0, idx), ...files.slice(idx + 1)]
        setFiles(newFiles)
    }

    const handleInputKeyDown = useCallback(
        (ev: React.KeyboardEvent) => {
            if (ev.key === 'Enter' && (ev.shiftKey || ev.metaKey)) {
                ev.preventDefault()
                handleSend()
            }
        },
        [handleSend],
    )

    const handleInputChange = (ev: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = ev.currentTarget.value
        setValue(v)
        const c = ev.currentTarget.selectionStart ?? v.length
        setCursor(c)
        if (mentionEnabled) detectMentionTrigger(v, c)
    }

    const handleInputSelect: React.ReactEventHandler<
        HTMLTextAreaElement
    > = ev => {
        const c = ev.currentTarget.selectionStart ?? value.length
        setCursor(c)
        if (mentionEnabled) detectMentionTrigger(value, c)
    }

    const insertMention = (item: MentionSelect) => {
        const { newText, newCursorPosition } = insertMentionFromHook(
            item,
            value,
        )
        setValue(newText)
        setCursor(newCursorPosition)
        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.selectionStart = newCursorPosition
                inputRef.current.selectionEnd = newCursorPosition
                inputRef.current.focus()
            }
        })
    }

    const replySender = useMemo(() => {
        if (!repliedEvent?.sender) return undefined

        const roomMember = roomMembers?.find(
            member => member.id === repliedEvent.sender,
        )
        if (roomMember) return roomMember

        return {
            id: repliedEvent.sender,
            displayName:
                repliedEvent.sender?.split(':')[0]?.replace('@', '') ||
                'Unknown',
        }
    }, [repliedEvent, roomMembers])

    const replyPreview = useMemo(() => {
        if (!repliedEvent) return null

        const body =
            ('body' in repliedEvent.content && repliedEvent.content.body) ||
            'Message'
        const formattedBody =
            'formatted_body' in repliedEvent.content
                ? repliedEvent.content.formatted_body
                : undefined
        const cleanBody = stripReplyFromBody(
            body,
            formattedBody as string | null,
        )

        return cleanBody.slice(0, 50) || 'Message'
    }, [repliedEvent])

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
            <HeaderWrapper back="/chat">
                <HeaderContent>
                    {avatar}
                    <HeaderText weight="medium">{name}</HeaderText>
                </HeaderContent>

                {headerActions && (
                    <HeaderActions>{headerActions}</HeaderActions>
                )}
            </HeaderWrapper>
            <ContentWrapper>
                <MessagesWrapper
                    ref={messagesRef}
                    onWheel={
                        onPaginate && !hasPaginated
                            ? handleMessagesScroll
                            : undefined
                    }>
                    {eventGroups.map(collection => (
                        <div
                            key={collection[0].at(-1)?.id}
                            data-event-id={collection[0].at(-1)?.id}
                            className={
                                highlightedMessageId ===
                                collection[0].at(-1)?.id
                                    ? 'highlighted'
                                    : ''
                            }>
                            <ChatEventCollection
                                roomId={id}
                                collection={collection}
                                showUsernames={type === ChatType.group}
                                onReplyTap={scrollToMessage}
                            />
                        </div>
                    ))}
                    <PaginationPlaceholder>
                        {isPaginating && <CircularLoader />}
                    </PaginationPlaceholder>
                </MessagesWrapper>
            </ContentWrapper>
            {repliedEvent && (
                <ReplyBar>
                    <ReplyIndicator />
                    <ReplyContent>
                        <ReplySender>
                            Replying to {replySender?.displayName || 'Unknown'}
                        </ReplySender>
                        <ReplyBody>{replyPreview}</ReplyBody>
                    </ReplyContent>
                    <ReplyCloseButton
                        type="button"
                        onClick={() => dispatch(clearChatReplyingToMessage())}>
                        ×
                    </ReplyCloseButton>
                </ReplyBar>
            )}

            <ActionsWrapper>
                {files.length > 0 && (
                    <ThumbnailsRow>
                        {files.map((file, idx: number) => (
                            <ChatAttachmentThumbnail
                                key={`${file.name}-${idx}`}
                                file={file}
                                onRemove={() => handleOnRemoveThumbnail(idx)}
                            />
                        ))}
                    </ThumbnailsRow>
                )}

                <InputRow>
                    <Input
                        ref={inputRef}
                        value={value}
                        onSelect={handleInputSelect}
                        onChange={handleInputChange}
                        onKeyUp={handleInputSelect}
                        onClick={handleInputSelect}
                        placeholder={t(
                            isReadOnly
                                ? 'feature.chat.broadcast-only-notice'
                                : 'phrases.type-message',
                        )}
                        rows={1}
                        onKeyDown={handleInputKeyDown}
                        disabled={isReadOnly}
                    />
                    {!isReadOnly && (
                        <input
                            data-testid="file-upload"
                            type="file"
                            ref={fileRef}
                            hidden
                            accept="image/*, video/*, .csv, .doc, .docx, .pdf, .ppt, .pptx, .xls, .xlsx, .txt, .zip"
                            onChange={handleOnUploadMedia}
                            multiple
                        />
                    )}
                </InputRow>

                {showMentionSuggestions && (
                    <MentionOverlay>
                        <ChatMentionSuggestions
                            visible={showMentionSuggestions}
                            suggestions={mentionSuggestions}
                            onSelect={insertMention}
                        />
                    </MentionOverlay>
                )}

                {!isReadOnly && (
                    <ActionsRow>
                        <InputActions>
                            {type === ChatType.direct && (
                                <Icon
                                    aria-label="wallet-icon"
                                    icon={WalletIcon}
                                    size={32}
                                    onClick={onWalletClick}
                                />
                            )}
                            {!isPublic && (
                                <Icon
                                    aria-label="plus-icon"
                                    icon={PlusIcon}
                                    size={26}
                                    onClick={handleOnMediaClick}
                                />
                            )}
                            {inputActions && inputActions}
                        </InputActions>
                        <SendButton
                            aria-label="send-button"
                            disabled={
                                (value.trim().length === 0 && !files.length) ||
                                isSending
                            }
                            onClick={handleSend}
                            onMouseDown={e => {
                                e.preventDefault() // Prevents focus from shifting (keyboard stays open)
                            }}>
                            <Icon icon={SendArrowUpCircleIcon} />
                        </SendButton>
                    </ActionsRow>
                )}
            </ActionsWrapper>
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

const HeaderActions = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
    position: 'absolute',
    right: 0,
})

const ContentWrapper = styled(Layout.Content, {})

const MessagesWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column-reverse',
    flex: 1,
    minHeight: 0,
    gap: 16,
    overflowY: 'auto',
    padding: 16,
})

const ActionsWrapper = styled('div', {
    borderTop: `1px solid ${theme.colors.extraLightGrey}`,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 8,
    position: 'relative',

    '@standalone': {
        '@sm': {
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        },
    },
})

const ActionsRow = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'row',
    height: 40,
    justifyContent: 'space-between',
    width: '100%',
})

const ThumbnailsRow = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    width: '100%',
})

const InputRow = styled('div', {
    width: '100%',
    position: 'relative',
})

const InputActions = styled('div', {
    alignItems: 'center',
    display: 'flex',
    gap: 8,
})

const Input = styled('textarea', {
    maxHeight: 120,
    padding: 4,
    border: 0,
    resize: 'none',
    width: '100%',

    '&:hover, &:focus': {
        outline: 'none',
    },
})

const SendButton = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: theme.colors.blue,

    '&:disabled': {
        color: theme.colors.darkGrey,
        pointerEvents: 'none',
    },

    '&:hover, &:focus': {
        outline: 'none',
        filter: 'brightness(1.25)',
    },

    '& > svg': {
        width: 32,
        height: 32,
    },
})

const PaginationPlaceholder = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 60,
    flexShrink: 0,
    color: theme.colors.grey,
})

const ReplyBar = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px',
    backgroundColor: theme.colors.offWhite100,
    borderTop: `1px solid ${theme.colors.lightGrey}`,
})

const ReplyIndicator = styled('div', {
    width: 4,
    height: 35,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    flexShrink: 0,
})

const ReplyContent = styled('div', {
    flex: 1,
    minWidth: 0,
})

const ReplySender = styled('div', {
    fontSize: 14,
    fontWeight: 700,
    color: theme.colors.darkGrey,
    marginBottom: 2,
})

const ReplyBody = styled('div', {
    fontSize: 13,
    color: theme.colors.grey,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
})

const ReplyCloseButton = styled('button', {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    color: theme.colors.grey,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 4,
    '&:hover': {
        backgroundColor: theme.colors.primary10,
    },
})

const MentionOverlay = styled('div', {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: 0,
    zIndex: 20,
})
