import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import SendArrowUpCircleIcon from '@fedi/common/assets/svgs/send-arrow-up-circle.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixRoom,
    selectMatrixRoomIsReadOnly,
    selectMatrixUser,
} from '@fedi/common/redux'
import { ChatType, MatrixEvent } from '@fedi/common/types'
import { makeMatrixEventGroups } from '@fedi/common/utils/matrix'

import {
    useAppSelector,
    useAutosizeTextArea,
    useIsTouchScreen,
} from '../../hooks'
import { styled, theme } from '../../styles'
import { Avatar } from '../Avatar'
import { CircularLoader } from '../CircularLoader'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'
import { ChatEventCollection } from './ChatEventCollection'

interface Props {
    type: ChatType
    id: string
    name: string
    events: MatrixEvent[]
    headerActions?: React.ReactNode
    inputActions?: React.ReactNode
    onSendMessage(message: string): Promise<void>
    onPaginate?: () => Promise<void>
}

export const ChatConversation: React.FC<Props> = ({
    type,
    id,
    name,
    events,
    headerActions,
    inputActions,
    onSendMessage,
    onPaginate,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const room = useAppSelector(s => selectMatrixRoom(s, id))
    const user = useAppSelector(s => selectMatrixUser(s, id))
    const isReadOnly = useAppSelector(s => selectMatrixRoomIsReadOnly(s, id))
    const [value, setValue] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [hasPaginated, setHasPaginated] = useState(false)
    const [isPaginating, setIsPaginating] = useState(false)
    const isTouchScreen = useIsTouchScreen()
    const inputRef = useRef<HTMLTextAreaElement>(null)
    useAutosizeTextArea(inputRef.current, value)

    const eventGroups = useMemo(
        () => makeMatrixEventGroups(events, 'desc'),
        [events],
    )

    // Any time we get a change in the number of events, we reset hasPaginated
    // so that the user will attempt pagination again.
    useEffect(() => {
        setHasPaginated(false)
    }, [events.length])

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

    // Handle loading initial messages
    useEffect(() => {
        if (!onPaginate) return
        setIsPaginating(true)
        setHasPaginated(true)
        onPaginate()
            .catch(() => null)
            .finally(() => setIsPaginating(false))
    }, [onPaginate])

    const handleSend = useCallback(
        async (ev?: React.FormEvent) => {
            if (ev) {
                ev.preventDefault()
            }

            // Prevent messages consisting of just spaces to be sent
            if (value.trim().length === 0) return

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

    let avatar: React.ReactNode
    if (room) {
        avatar = <ChatAvatar room={room} size="sm" />
    } else if (user) {
        avatar = <ChatAvatar user={user} size="sm" />
    } else {
        avatar = <Avatar size="sm" id={id} name={name} />
    }

    return (
        <Layout.Root>
            <Layout.Header
                padded
                displaceBackIcon={!headerActions}
                back="/chat">
                <HeaderContent>
                    {avatar}
                    <Text weight="medium">{name}</Text>
                </HeaderContent>

                {headerActions && (
                    <HeaderActions>{headerActions}</HeaderActions>
                )}
            </Layout.Header>
            <Layout.Content fullWidth>
                <Messages
                    onWheel={
                        onPaginate && !hasPaginated
                            ? handleMessagesScroll
                            : undefined
                    }>
                    {eventGroups.map(collection => (
                        <ChatEventCollection
                            key={collection[0][0].id}
                            roomId={id}
                            collection={collection}
                            showUsernames={type === ChatType.group}
                        />
                    ))}
                    <PaginationPlaceholder>
                        {isPaginating && <CircularLoader />}
                    </PaginationPlaceholder>
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
                <SendButton
                    disabled={value.trim().length === 0 || isSending}
                    type="submit">
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
        color: theme.colors.darkGrey,
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

const PaginationPlaceholder = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 60,
    flexShrink: 0,
    color: theme.colors.grey,
})
