import * as RadixDialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { setChatReplyingToMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'

import { useAppDispatch } from '../../hooks'
import { keyframes, styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'
import { canReplyToEvent } from './chatMessageActionUtils'

interface Props {
    event: MatrixEvent
    open: boolean
    onOpenChange(open: boolean): void
}

export const ChatMessageActionsDrawer: React.FC<Props> = ({
    event,
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const canReply = canReplyToEvent(event)

    const handleReply = useCallback(() => {
        dispatch(
            setChatReplyingToMessage({
                roomId: event.roomId,
                event,
            }),
        )
        onOpenChange(false)
    }, [dispatch, event, onOpenChange])

    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <Overlay data-testid="message-actions-backdrop">
                    <Content onOpenAutoFocus={ev => ev.preventDefault()}>
                        <VisuallyHidden>
                            <RadixDialog.Title>
                                {t('words.actions')}
                            </RadixDialog.Title>
                            <RadixDialog.Description />
                        </VisuallyHidden>
                        <ActionList>
                            {canReply && (
                                <ActionButton onClick={handleReply}>
                                    <Icon icon="ArrowCornerUpLeftDouble" />
                                    <Text weight="bold">
                                        {t('words.reply')}
                                    </Text>
                                </ActionButton>
                            )}
                        </ActionList>
                    </Content>
                </Overlay>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    )
}

const overlayShow = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const drawerShow = keyframes({
    '0%': { transform: 'translateY(100%)' },
    '100%': { transform: 'translateY(0)' },
})

const Overlay = styled(RadixDialog.Overlay, {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    background: theme.colors.primary80,
    animation: `${overlayShow} 150ms ease`,
})

const Content = styled(RadixDialog.Content, {
    width: '100%',
    maxWidth: theme.sizes.desktopAppWidth,
    background: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 8,
    paddingBottom: 8,
    animation: `${drawerShow} 180ms ease`,
    outline: 'none',

    '@standalone': {
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
    },
})

const ActionList = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
})

const ActionButton = styled('button', {
    appearance: 'none',
    border: 0,
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minHeight: 44,
    padding: 8,
    borderRadius: 8,
    color: theme.colors.primary,
    textAlign: 'left',
    cursor: 'pointer',

    '&:hover, &:focus-visible': {
        background: theme.colors.primary05,
        outline: 'none',
    },

    '&:disabled': {
        cursor: 'not-allowed',
        opacity: 0.5,
    },
})
