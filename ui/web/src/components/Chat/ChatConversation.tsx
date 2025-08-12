import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ImageIcon from '@fedi/common/assets/svgs/image.svg'
import SendArrowUpCircleIcon from '@fedi/common/assets/svgs/send-arrow-up-circle.svg'
import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
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
import { ChatMediaThumbnail } from './ChatMediaThumbnail'

interface Props {
    type: ChatType
    id: string
    name: string
    events: MatrixEvent[]
    onSendMessage(message: string, files: File[]): Promise<void>
    headerActions?: React.ReactNode
    inputActions?: boolean
    onWalletClick?(): void
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
    onWalletClick,
    onPaginate,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const isTouchScreen = useIsTouchScreen()

    const room = useAppSelector(s => selectMatrixRoom(s, id))
    const user = useAppSelector(s => selectMatrixUser(s, id))
    const isReadOnly = useAppSelector(s => selectMatrixRoomIsReadOnly(s, id))

    const [value, setValue] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [hasPaginated, setHasPaginated] = useState(false)
    const [isPaginating, setIsPaginating] = useState(false)
    const [files, setFiles] = useState<File[]>([])

    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)

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

    // Handle loading initial messages
    useEffect(() => {
        if (!onPaginate) return
        setIsPaginating(true)
        setHasPaginated(true)
        onPaginate()
            .catch(() => null)
            .finally(() => setIsPaginating(false))
    }, [onPaginate])

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

            setIsSending(true)
            try {
                await onSendMessage(value, files)
                setValue('')
                setFiles([])
            } catch (err) {
                toast.error(t, err, 'errors.chat-connection-unhealthy')
            }
            setIsSending(false)
        },
        [onSendMessage, files, t, toast, value],
    )

    const handleOnMediaClick = () => {
        if (!fileRef.current) return
        fileRef.current?.click()
    }

    const handleOnUploadMedia = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        if (!event.target.files || !event.target.files.length) return
        const file = event.target.files[0]

        setFiles(prev => [...prev, file])
    }

    const handleOnRemoveThumbnail = (idx: number) => {
        // get everything back except item at idx
        const newFiles = [...files.slice(0, idx), ...files.slice(idx + 1)]

        setFiles(newFiles)
    }

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
                {files.length > 0 && (
                    <ThumbnailsRow>
                        {files.map((file, idx: number) => (
                            <ChatMediaThumbnail
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
                        onChange={ev => setValue(ev.currentTarget.value)}
                        placeholder={t(
                            isReadOnly
                                ? 'feature.chat.broadcast-only-notice'
                                : 'phrases.type-message',
                        )}
                        autoFocus={!isTouchScreen}
                        rows={1}
                        onKeyDown={handleInputKeyDown}
                        disabled={isSending || isReadOnly}
                    />
                    <input
                        data-testid="file-upload"
                        type="file"
                        ref={fileRef}
                        hidden
                        accept="image/*, video/*"
                        onChange={handleOnUploadMedia}
                    />
                </InputRow>

                <ActionsRow>
                    <InputActions>
                        {inputActions && (
                            <>
                                <Icon
                                    aria-label="wallet-icon"
                                    icon={WalletIcon}
                                    size={32}
                                    onClick={onWalletClick}
                                />
                                <Icon
                                    aria-label="image-icon"
                                    icon={ImageIcon}
                                    size={26}
                                    onClick={handleOnMediaClick}
                                />
                            </>
                        )}
                    </InputActions>
                    <SendButton
                        disabled={
                            (value.trim().length === 0 && !files.length) ||
                            isSending
                        }
                        type="submit">
                        <Icon icon={SendArrowUpCircleIcon} />
                    </SendButton>
                </ActionsRow>
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
    alignItems: 'center',
    borderTop: `1px solid ${theme.colors.lightGrey}`,
    display: 'flex',
    flexDirection: 'column',
    padding: 8,
    width: '100%',

    '@standalone': {
        '@sm': {
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        },
    },
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
})

const ActionsRow = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: 40,
    justifyContent: 'space-between',
    width: '100%',
})

const InputActions = styled('div', {
    alignItems: 'center',
    display: 'flex',
    gap: 8,
})

const Input = styled('textarea', {
    flex: 1,
    maxHeight: 120,
    padding: 4,
    border: 0,
    background: 'none',
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
