import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ChevronLeftIcon from '@fedi/common/assets/svgs/chevron-left.svg'
import SendArrowUpCircleIcon from '@fedi/common/assets/svgs/send-arrow-up-circle.svg'
import { useUpdateLastMessageRead } from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import { selectChat, selectChatGroupRole } from '@fedi/common/redux'
import {
    ChatMessage as ChatMessageType,
    ChatRole,
    ChatType,
} from '@fedi/common/types'
import { makeMessageGroups } from '@fedi/common/utils/chat'

import { useAutosizeTextArea, useAppSelector, useIsTouchScreen } from '../hooks'
import { styled, theme } from '../styles'
import { ChatAvatar } from './ChatAvatar'
import { ChatMessageCollection } from './ChatMessageCollection'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import * as Layout from './Layout'
import { Text } from './Text'

interface Props {
    type: ChatType
    id: string
    name: string
    messages: ChatMessageType[]
    headerActions?: React.ReactNode
    inputActions?: React.ReactNode
    onSendMessage(message: string): Promise<void>
}

export const ChatConversation: React.FC<Props> = ({
    type,
    id,
    name,
    messages,
    headerActions,
    inputActions,
    onSendMessage,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { back } = useRouter()
    const chat = useAppSelector(s => selectChat(s, id))
    const role = useAppSelector(s => selectChatGroupRole(s, id))
    const [value, setValue] = useState('')
    const [isSending, setIsSending] = useState(false)
    const isTouchScreen = useIsTouchScreen()
    const inputRef = useRef<HTMLTextAreaElement>(null)
    useAutosizeTextArea(inputRef.current, value)

    const isReadOnly = chat?.broadcastOnly && role === ChatRole.visitor

    const messageCollections = useMemo(
        () => makeMessageGroups(messages, 'desc'),
        [messages],
    )

    // While we have the chat open, mark any message that comes in as read
    useUpdateLastMessageRead(id, messages)

    const handleSend = useCallback(
        async (ev?: React.FormEvent) => {
            if (ev) {
                ev.preventDefault()
            }
            if (!value) return
            setIsSending(true)
            try {
                await onSendMessage(value)
                setValue('')
            } catch (err) {
                toast.error(t, err, 'errors.chat-connection-unhealthy')
            }
            setIsSending(false)
        },
        [onSendMessage, value, toast, t],
    )

    const handleInputKeyDown = useCallback(
        (ev: React.KeyboardEvent) => {
            if (ev.key === 'Enter' && !(ev.shiftKey || ev.metaKey)) {
                ev.preventDefault()
                handleSend()
            }
        },
        [handleSend],
    )

    // Re-focus input after it had been disabled
    const inputDisabled = isSending || isReadOnly
    useEffect(() => {
        if (!inputDisabled) {
            inputRef.current?.focus()
        }
    }, [inputDisabled])

    return (
        <Layout.Root>
            <Layout.Header padded displaceBackIcon={!headerActions}>
                <HeaderInfo>
                    <BackButton>
                        <IconButton
                            size="md"
                            icon={ChevronLeftIcon}
                            onClick={() => back()}
                        />
                    </BackButton>
                </HeaderInfo>
                <HeaderContent>
                    <ChatAvatar chat={chat} size="sm" />
                    <Text weight="medium">{name}</Text>
                </HeaderContent>

                {headerActions && (
                    <HeaderActions>{headerActions}</HeaderActions>
                )}
            </Layout.Header>
            <Layout.Content fullWidth>
                <Messages>
                    {messageCollections.map(collection => (
                        <ChatMessageCollection
                            key={collection[0][0].id}
                            collection={collection}
                            showUsernames={type === ChatType.group}
                        />
                    ))}
                </Messages>
            </Layout.Content>
            <Actions onSubmit={handleSend}>
                {inputActions && <InputActions>{inputActions}</InputActions>}
                <Input
                    ref={inputRef}
                    value={value}
                    onChange={ev => setValue(ev.currentTarget.value)}
                    placeholder={t(
                        isReadOnly
                            ? 'feature.chat.broadcast-only-notice'
                            : 'words.message',
                    )}
                    autoFocus={!isTouchScreen}
                    rows={1}
                    onKeyDown={handleInputKeyDown}
                    disabled={isSending || isReadOnly}
                />
                <SendButton disabled={!value || isSending} type="submit">
                    <Icon icon={SendArrowUpCircleIcon} />
                </SendButton>
            </Actions>
        </Layout.Root>
    )
}

const HeaderContent = styled('div', {
    display: 'flex',
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
})

const HeaderInfo = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
})

const BackButton = styled('div', {
    display: 'none',
    '@sm': {
        display: 'block',
    },
})

const HeaderActions = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
})

const Messages = styled('div', {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column-reverse',
    padding: 16,
    overflow: 'auto',
})

const Actions = styled('form', {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    padding: 8,
    borderTop: `1px solid ${theme.colors.lightGrey}`,

    '@standalone': {
        '@sm': {
            paddingBottom: 'env(safe-area-inset-bottom, 8px)',
        },
    },
})

const InputActions = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
})

const Input = styled('textarea', {
    flex: 1,
    maxHeight: 120,
    padding: 8,
    border: 0,
    background: 'none',
    resize: 'none',

    '&:hover, &:focus': {
        outline: 'none',
    },
})

const SendButton = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    color: theme.colors.blue,

    '&:disabled': {
        color: theme.colors.lightGrey,
        pointerEvents: 'none',
    },

    '&:hover, &:focus': {
        outline: 'none',
        filter: 'brightness(1.25)',
    },

    '& > svg': {
        width: 24,
        height: 24,
    },
})
