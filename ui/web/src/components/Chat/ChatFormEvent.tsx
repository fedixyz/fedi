import React from 'react'
import { useTranslation } from 'react-i18next'

import { useMatrixFormEvent } from '@fedi/common/hooks/matrix'
import { MatrixFormEvent } from '@fedi/common/types'

import { styled } from '../../styles'
import { Button } from '../Button'

interface Props {
    event: MatrixFormEvent
}

export const ChatFormEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()

    const { isSentByMe, messageText, actionButton, options } =
        useMatrixFormEvent(event, t)

    let extra: React.ReactNode = null
    if (actionButton || options.length > 0) {
        extra = (
            <>
                {actionButton && (
                    <ActionButtonContainer>
                        <Button
                            key={actionButton.label}
                            variant="secondary"
                            size="sm"
                            onClick={actionButton.handler}
                            loading={actionButton.loading}
                            disabled={actionButton.disabled}>
                            {actionButton.label}
                        </Button>
                    </ActionButtonContainer>
                )}
                {options.length > 0 && (
                    <OptionsContainer>
                        {options.map((option, i) => (
                            <Option key={`o-${i}`}>
                                <OptionText>{option.label}</OptionText>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={option.handler}>
                                    {t('words.select')}
                                </Button>
                            </Option>
                        ))}
                    </OptionsContainer>
                )}
            </>
        )
    }

    return (
        <>
            {messageText && (
                <MessageContainer isSentByMe={isSentByMe}>
                    {messageText}
                </MessageContainer>
            )}
            {extra || null}
        </>
    )
}

const MessageContainer = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    variants: {
        isSentByMe: {
            true: {
                fontStyle: 'italic',
            },
        },
    },
})

const OptionsContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'space-between',
    marginTop: 8,
    gap: 12,
})

const OptionText = styled('div', {
    flex: 1,
    whiteSpace: 'pre-line',
})

const Option = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
})

const ActionButtonContainer = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 12,

    '> button': {
        filter: 'drop-shadow(0px 2px 1px rgba(0, 0, 0, 0.15))',
    },
})
