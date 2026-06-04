import React from 'react'

import { styled, theme } from '../styles'
import { Row } from './Flex'
import { Text } from './Text'

type DetailsRowProps = {
    label: React.ReactNode
    value: React.ReactNode
}

export const DetailsRow = ({ label, value }: DetailsRowProps) => {
    return (
        <Container justify="between" align="center">
            <Text weight="bold">{label}</Text>
            <Text>{value}</Text>
        </Container>
    )
}

const Container = styled(Row, {
    borderBottom: `1px solid ${theme.colors.extraLightGrey}`,
    padding: `${theme.spacing.lg} 0`,

    '&:last-child': {
        borderBottom: 'none',
    },
})
