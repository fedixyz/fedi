import React, { useMemo, useState, useCallback } from 'react'

import { ReplyMessageData } from '@fedi/common/types'

import { styled, theme } from '../../styles'

interface Props {
    data: ReplyMessageData
    senderName: string
    onReplyTap?: (eventId: string) => void
    isMe?: boolean
}

export const ChatRepliedMessage: React.FC<Props> = ({
    data,
    senderName,
    onReplyTap,
    isMe = false,
}) => {
    const [isPressed, setIsPressed] = useState(false)

    const truncatedBody = useMemo(() => {
        const body = data?.content?.body || 'Message'
        // Dynamically adjust truncation length based on message size for better readability
        // Longer messages get more characters before truncation to preserve context
        const maxLength =
            body.length > 150 ? 200 : body.length > 100 ? 150 : 100
        return body.length > maxLength
            ? `${body.substring(0, maxLength)}...`
            : body
    }, [data.content])

    const handleClick = useCallback(() => {
        if (onReplyTap && data.id) {
            onReplyTap(data.id)
        }
    }, [onReplyTap, data.id])

    const handleMouseDown = useCallback(() => setIsPressed(true), [])
    const handleMouseUp = useCallback(() => setIsPressed(false), [])
    const handleMouseLeave = useCallback(() => setIsPressed(false), [])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClick()
            }
        },
        [handleClick],
    )

    return (
        <ReplyContainer
            isMe={isMe}
            isPressed={isPressed}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            aria-label={`Reply to message from ${senderName}: ${truncatedBody}`}>
            <ReplyIndicator isMe={isMe} />

            <ReplyContent>
                <SenderRow>
                    <SenderAvatar isMe={isMe}>
                        {senderName.charAt(0).toUpperCase()}
                    </SenderAvatar>
                    <SenderName isMe={isMe}>{senderName}</SenderName>
                    <ReplyIcon isMe={isMe}>↗</ReplyIcon>
                </SenderRow>

                <ReplyBody isMe={isMe}>{truncatedBody}</ReplyBody>
            </ReplyContent>
        </ReplyContainer>
    )
}

const ReplyContainer = styled('div', {
    alignItems: 'center',
    borderRadius: 8,
    border: `1px solid ${theme.colors.white20}`,
    display: 'flex',
    minHeight: 60,
    maxHeight: 120,
    width: '100%',
    minWidth: 100,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    padding: 5,
    gap: 10,

    '&:hover': {
        transform: 'translateY(-1px) translateZ(0)',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
    },

    '&:focus': {
        outline: `2px solid ${theme.colors.primary}`,
        outlineOffset: 2,
    },

    variants: {
        isMe: {
            true: {
                backgroundColor: theme.colors.white10,
            },
            false: {
                backgroundColor: theme.colors.primary05,
                borderColor: theme.colors.primary10,
            },
        },
        isPressed: {
            true: {
                transform: 'scale(0.98) translateZ(0)',
            },
        },
    },
})

const ReplyIndicator = styled('div', {
    borderRadius: 2,
    left: 4,
    flexShrink: 0,
    height: 34,
    width: 4,

    variants: {
        isMe: {
            true: {
                backgroundColor: theme.colors.white,
            },
            false: {
                backgroundColor: theme.colors.primary20,
            },
        },
    },
})

const ReplyContent = styled('div', {
    alignItems: 'space-between',
    display: 'flex',
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
})

const SenderRow = styled('div', {
    alignItems: 'center',
    display: 'flex',
    gap: 6,
})

const SenderAvatar = styled('div', {
    width: 16,
    height: 16,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 9,
    fontWeight: 700,

    variants: {
        isMe: {
            true: {
                backgroundColor: theme.colors.white30,
                color: theme.colors.white,
            },
            false: {
                backgroundColor: theme.colors.primary10,
                color: theme.colors.primary,
            },
        },
    },
})

const SenderName = styled('div', {
    fontSize: 12,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',

    variants: {
        isMe: {
            true: {
                color: theme.colors.white,
            },
            false: {
                color: theme.colors.primary,
            },
        },
    },
})

const ReplyIcon = styled('div', {
    width: 14,
    height: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
    flexShrink: 0,
    fontSize: 10,

    variants: {
        isMe: {
            true: {
                color: theme.colors.white,
            },
            false: {
                color: theme.colors.darkGrey,
            },
        },
    },
})

const ReplyBody = styled('div', {
    fontSize: 12,
    lineHeight: '16px',
    fontStyle: 'italic',
    opacity: 0.9,
    minHeight: 16,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',

    variants: {
        isMe: {
            true: {
                color: theme.colors.white,
            },
            false: {
                color: theme.colors.grey,
            },
        },
    },
})
