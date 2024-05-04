import React from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'

import { styled, theme } from '../styles'
import { Icon } from './Icon'

export const ChatEventError: React.FC = () => {
    const { t } = useTranslation()
    return (
        <Container>
            <Icon icon={ErrorIcon} size="xs" />
            <Message>{t('errors.chat-message-render-error')}</Message>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    alignItems: 'center',
    width: 'fit-content',
    gap: 8,
    maxWidth: '90%',
    padding: 8,
    lineHeight: '20px',
    background: theme.colors.red,
    color: theme.colors.white,
    borderRadius: 12,
})

const Message = styled('div', {
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
})
