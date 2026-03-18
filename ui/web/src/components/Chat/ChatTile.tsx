import Link from 'next/link'
import React, { ReactNode } from 'react'

import { styled, theme } from '../../styles'
import { NotificationDot } from '../NotificationDot'
import { Text, TextProps } from '../Text'

export type ChatTileProps = {
    avatar: ReactNode
    title: string
    subtitle: ReactNode
    subtitleProps?: Partial<TextProps>
    timestamp?: ReactNode
    showUnreadIndicator?: boolean
    href: string
    active?: boolean
}

export const ChatTile: React.FC<ChatTileProps> = ({
    avatar,
    title,
    subtitle,
    subtitleProps,
    timestamp,
    showUnreadIndicator = false,
    href,
    active,
}) => {
    const containerProps = {
        active,
        href,
    }

    return (
        <Container {...containerProps}>
            <NotificationDot visible={showUnreadIndicator}>
                {avatar}
            </NotificationDot>
            <Content>
                <TopContent>
                    <Text
                        weight="bold"
                        ellipsize
                        css={{ flex: 1, minWidth: 0 }}>
                        {title}
                    </Text>
                    {timestamp && (
                        <Text variant="small" css={{ flexShrink: 0 }}>
                            {timestamp}
                        </Text>
                    )}
                </TopContent>
                <Text
                    variant="small"
                    ellipsize
                    css={{ color: theme.colors.darkGrey }}
                    {...subtitleProps}>
                    {subtitle}
                </Text>
            </Content>
        </Container>
    )
}

const Container = styled(Link, {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    cursor: 'pointer',

    '&:hover, &:focus': {
        background: theme.colors.primary05,
    },

    variants: {
        active: {
            true: {
                background: theme.colors.primary05,
            },
        },
    },
})

const Content = styled('div', {
    flex: 1,
    minWidth: 0,
})

const TopContent = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
})
