import React from 'react'

import { styled, theme } from '../styles'
import { Text } from './Text'

type Props = {
    label: string
}

export const Pill: React.FC<Props> = ({ label }) => {
    return (
        <Container>
            <Text
                variant="small"
                weight="bolder"
                css={{ color: theme.colors.white }}>
                {label}
            </Text>
        </Container>
    )
}

const Container = styled('div', {
    alignItems: 'center',
    backgroundColor: theme.colors.grey400,
    borderRadius: 4,
    display: 'inline-flex',
    justifyContent: 'center',
    padding: `${theme.spacing.xxs} ${theme.spacing.xs}`,
})
