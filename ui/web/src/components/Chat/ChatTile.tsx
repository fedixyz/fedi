import Link from 'next/link'
import React, { ReactNode } from 'react'

import { styled, theme } from '../../styles'
import { Row } from '../Flex'
import { Icon } from '../Icon'
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
    icon?: React.FunctionComponent<React.SVGAttributes<SVGElement>>
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
    icon,
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
                <Row gap="xs" align="center">
                    {icon && <SubtitleIcon icon={icon} />}
                    <Text
                        variant="small"
                        ellipsize
                        css={{ color: theme.colors.darkGrey }}
                        {...subtitleProps}>
                        {subtitle}
                    </Text>
                </Row>
            </Content>
        </Container>
    )
}

const SubtitleIcon = styled(Icon, {
    color: theme.colors.darkGrey,
    width: 16,
    height: 16,
})

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
