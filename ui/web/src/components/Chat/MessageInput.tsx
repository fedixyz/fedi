import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GUARDIANITO_BOT_DISPLAY_NAME } from '@fedi/common/constants/matrix'
import { useMessageInputState } from '@fedi/common/hooks/chat'
import { useMentionInput } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    clearChatReplyingToMessage,
    selectIsDefaultGroup,
    selectMatrixAuth,
    selectMatrixRoom,
    selectMatrixRoomIsReadOnly,
    selectMatrixRoomMembers,
    selectReplyingToMessageEventForRoom,
} from '@fedi/common/redux'
import { ChatType, MatrixRoomMember, MentionSelect } from '@fedi/common/types'
import {
    RpcMatrixMembership,
    RpcUserPowerLevel,
} from '@fedi/common/types/bindings'
import { matrixIdToUsername } from '@fedi/common/utils/matrix'

import {
    useAppDispatch,
    useAppSelector,
    useAutosizeTextArea,
    useMessageAttachments,
} from '../../hooks'
import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { ChatAttachmentThumbnail } from './ChatAttachmentThumbnail'
import { ChatCreatePollDialog } from './ChatCreatePollDialog'
import ChatMentionSuggestions from './ChatMentionSuggestions'
import GuardianitoHelp from './GuardianitoHelp'
import MessageInputReplyBar from './MessageInputReplyBar'

interface Props {
    type: ChatType
    id: string
    onWalletClick?(): void
    onMessageSubmitted(
        message: string,
        files: File[],
        repliedEventId?: string | null,
    ): Promise<void>
}

export const MessageInput: React.FC<Props> = ({
    type,
    id,
    onWalletClick,
    onMessageSubmitted,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()

    const room = useAppSelector(s => selectMatrixRoom(s, id))
    const isReadOnly = useAppSelector(s => selectMatrixRoomIsReadOnly(s, id))
    const isDefaultGroup = useAppSelector(s => selectIsDefaultGroup(s, id))
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, id))
    const auth = useAppSelector(s => selectMatrixAuth(s))
    const selfUserId = auth?.userId || undefined
    const isGuardianitoRoom = room?.name === GUARDIANITO_BOT_DISPLAY_NAME
    const directUserId = room?.directUserId
    const repliedEvent = useAppSelector(s =>
        selectReplyingToMessageEventForRoom(s, id),
    )

    const {
        messageText,
        setMessageText,
        resetMessageText,
        shouldShowMediaButtons,
    } = useMessageInputState(id)
    const attachments = useMessageAttachments()
    const [isSending, setIsSending] = useState(false)
    const [isCreatePollOpen, setIsCreatePollOpen] = useState(false)
    const [cursor, setCursor] = useState(0)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const canAttachMedia = !!room && shouldShowMediaButtons

    useAutosizeTextArea(inputRef.current, messageText)

    const mentionEnabled = type === ChatType.group && !!room
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
            powerLevel: { type: 'int', value: 0 } as RpcUserPowerLevel,
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

    const { mentionSuggestions, shouldShowSuggestions, insertMention } =
        useMentionInput(membersForMentions, messageText, cursor)

    const showMentionSuggestions =
        mentionEnabled && !isReadOnly && shouldShowSuggestions
    const showPollButton =
        !!room &&
        type === ChatType.group &&
        !room.isDirect &&
        !room.broadcastOnly &&
        !isDefaultGroup &&
        !isReadOnly

    const handleSend = useCallback(
        async (ev?: React.FormEvent) => {
            if (ev) {
                ev.preventDefault()
            }

            if (!messageText.trim() && !attachments.hasAttachments) return

            try {
                setIsSending(true)
                await onMessageSubmitted(
                    messageText,
                    attachments.files,
                    repliedEvent?.id ?? null,
                )
                resetMessageText({ clearDraft: true })
                attachments.clearAll()
                if (repliedEvent) {
                    dispatch(clearChatReplyingToMessage())
                }
            } catch (err) {
                toast.error(t, err, 'errors.chat-connection-unhealthy')
            } finally {
                setIsSending(false)
            }
        },
        [
            onMessageSubmitted,
            messageText,
            attachments,
            repliedEvent,
            dispatch,
            toast,
            t,
            resetMessageText,
        ],
    )

    const handleInputKeyDown = useCallback(
        (ev: React.KeyboardEvent) => {
            if (ev.key === 'Enter' && (ev.shiftKey || ev.metaKey)) {
                ev.preventDefault()
                handleSend()
            }
        },
        [handleSend],
    )

    const handleSelectMention = (item: MentionSelect) => {
        const { newText, newCursorPosition } = insertMention(item, messageText)
        setMessageText(newText)
        setCursor(newCursorPosition)
        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.selectionStart = newCursorPosition
                inputRef.current.selectionEnd = newCursorPosition
                inputRef.current.focus()
            }
        })
    }

    return (
        <>
            {repliedEvent && (
                <MessageInputReplyBar
                    repliedEvent={repliedEvent}
                    roomMembers={roomMembers || []}
                />
            )}
            {isGuardianitoRoom && <GuardianitoHelp />}
            <ActionsWrapper>
                {attachments.hasAttachments && (
                    <ThumbnailsRow>
                        {attachments.files.map((file, idx: number) => (
                            <ChatAttachmentThumbnail
                                key={`${file.name}-${idx}`}
                                file={file}
                                onRemove={() => attachments.removeFile(idx)}
                            />
                        ))}
                    </ThumbnailsRow>
                )}

                <InputRow>
                    <Input
                        ref={inputRef}
                        value={messageText}
                        onSelect={ev =>
                            setCursor(ev.currentTarget.selectionStart)
                        }
                        onChange={ev => setMessageText(ev.currentTarget.value)}
                        placeholder={t(
                            isReadOnly
                                ? 'feature.chat.broadcast-only-notice'
                                : 'phrases.type-message',
                        )}
                        rows={1}
                        onKeyDown={handleInputKeyDown}
                        disabled={isReadOnly}
                    />
                    {canAttachMedia && (
                        <input
                            data-testid="file-upload"
                            type="file"
                            ref={attachments.fileInputRef}
                            hidden
                            accept="image/*, video/*, .csv, .doc, .docx, .pdf, .ppt, .pptx, .xls, .xlsx, .txt, .zip"
                            onChange={attachments.handleFileInputChange}
                            multiple
                        />
                    )}
                </InputRow>

                {showMentionSuggestions && (
                    <MentionOverlay>
                        <ChatMentionSuggestions
                            visible={showMentionSuggestions}
                            suggestions={mentionSuggestions}
                            onSelect={handleSelectMention}
                        />
                    </MentionOverlay>
                )}

                {!isReadOnly && (
                    <ActionsRow>
                        <InputActions>
                            {directUserId && onWalletClick && (
                                <Icon
                                    aria-label="wallet-icon"
                                    icon="Wallet"
                                    size={32}
                                    onClick={onWalletClick}
                                />
                            )}
                            {showPollButton && (
                                <Icon
                                    aria-label="poll-icon"
                                    icon="Poll"
                                    size={26}
                                    onClick={() => setIsCreatePollOpen(true)}
                                />
                            )}
                            {canAttachMedia && (
                                <Icon
                                    aria-label="plus-icon"
                                    icon="Plus"
                                    size={26}
                                    onClick={attachments.triggerFilePicker}
                                />
                            )}
                        </InputActions>
                        <SendButton
                            aria-label="send-button"
                            disabled={
                                (messageText.trim().length === 0 &&
                                    !attachments.hasAttachments) ||
                                isSending
                            }
                            onClick={handleSend}
                            onMouseDown={e => {
                                e.preventDefault() // Prevents focus from shifting (keyboard stays open)
                            }}>
                            <Icon icon="SendArrowUpCircle" size={30} />
                        </SendButton>
                    </ActionsRow>
                )}
            </ActionsWrapper>
            <ChatCreatePollDialog
                roomId={id}
                open={isCreatePollOpen}
                onOpenChange={setIsCreatePollOpen}
            />
        </>
    )
}

const ActionsWrapper = styled('div', {
    borderTop: `1px solid ${theme.colors.extraLightGrey}`,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 8,
    position: 'relative',

    '@standalone': {
        '@sm': {
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
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

const MentionOverlay = styled('div', {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: 0,
    zIndex: 20,
})
