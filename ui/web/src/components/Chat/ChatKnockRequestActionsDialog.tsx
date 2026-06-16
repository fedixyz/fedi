import React from 'react'
import { useTranslation } from 'react-i18next'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { MatrixRoomMember } from '@fedi/common/types'

import { styled, theme } from '../../styles'
import { Dialog } from '../Dialog'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

interface Props {
    member: MatrixRoomMember | null
    isProcessing: boolean
    onAccept: (userId: string) => void
    onDecline: (userId: string) => void
    onClose: () => void
}

export const ChatKnockRequestActionsDialog: React.FC<Props> = ({
    member,
    isProcessing,
    onAccept,
    onDecline,
    onClose,
}) => {
    const { t } = useTranslation()

    if (!member) return null

    return (
        <Dialog
            open={!!member}
            onOpenChange={open => {
                if (!open) onClose()
            }}
            type="tray"
            title={
                <Row gap="xs" align="center" center>
                    <ChatAvatar user={member} size="sm" />
                    <Text weight="bold">{member.displayName || member.id}</Text>
                </Row>
            }>
            <Column fullWidth gap="xs">
                <Action
                    disabled={isProcessing}
                    onClick={() => !isProcessing && onAccept(member.id)}>
                    <Icon icon="Check" />
                    <Text weight="medium">
                        {t('feature.chat.accept-knock')}
                    </Text>
                </Action>
                <Action
                    disabled={isProcessing}
                    onClick={() => !isProcessing && onDecline(member.id)}>
                    <Icon icon="Close" color={fediTheme.colors.red} />
                    <Text weight="medium" css={{ color: theme.colors.red }}>
                        {t('feature.chat.decline-knock')}
                    </Text>
                </Action>
            </Column>
        </Dialog>
    )
}

const Action = styled('div', {
    alignItems: 'center',
    display: 'flex',
    gap: theme.spacing.md,
    padding: `${theme.spacing.md} ${theme.spacing.sm}`,
    borderRadius: 12,
    cursor: 'pointer',

    '&:hover': {
        background: theme.colors.primary05,
    },

    variants: {
        disabled: {
            true: {
                cursor: 'default',
                opacity: 0.5,
                pointerEvents: 'none',
            },
        },
    },
})
