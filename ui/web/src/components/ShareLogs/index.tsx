import React from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '../../components/Input'
import { styled, theme } from '../../styles'
import { Text } from '../Text'

interface Props {
    ticketNumber: string
    onChange(value: string): void
    error?: string | null
}

export default function ShareLogs({ ticketNumber, onChange, error }: Props) {
    const { t } = useTranslation()

    return (
        <Form>
            <Input
                label={
                    <Text variant="caption" weight="medium">
                        {t('feature.support.enter-ticket-number')}
                    </Text>
                }
                value={ticketNumber}
                onChange={e => onChange(e.currentTarget.value)}
                placeholder={t('feature.support.support-ticket-number')}
                name="email"
                type="email"
                id="email"
                autoComplete="off"
            />
            {error && (
                <Error>
                    <Text variant="small" css={{ color: theme.colors.red }}>
                        {error}
                    </Text>
                </Error>
            )}
        </Form>
    )
}

const Form = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
})

const Error = styled('div', {
    marginLeft: 5,
    marginTop: 5,
})
