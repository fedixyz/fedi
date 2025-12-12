import React from 'react'

import { styled, theme } from '../styles'
import { Text } from './Text'

interface Option {
    label: string
    value: string
}

export interface Props {
    options: Option[]
    onChange: (value: string) => void
    selected: string
}

export const Switcher: React.FC<Props> = ({ options, onChange, selected }) => {
    return (
        <Container>
            {options.map((option: Option) => (
                <Item
                    key={option.value}
                    data-testid={`${option.value}Tab`}
                    onClick={() => onChange(option.value)}
                    selected={selected === option.value}>
                    <Text variant="caption">{option.label}</Text>
                </Item>
            ))}
        </Container>
    )
}

const Container = styled('div', {
    backgroundColor: theme.colors.extraLightGrey,
    borderRadius: 20,
    display: 'flex',
    flexShrink: 0,
    height: 40,
    overflow: 'hidden',
    width: '100%',
})

const Item = styled('div', {
    alignItems: 'center',
    backgroundColor: theme.colors.extraLightGrey,
    border: `2px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 20,
    color: theme.colors.night,
    cursor: 'pointer',
    display: 'flex',
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    width: '100%',

    variants: {
        selected: {
            true: {
                backgroundColor: theme.colors.white,
            },
        },
    },
})
