import React from 'react'

import { Text } from '../../components/Text'
import { styled } from '../../styles'

export const TextDemo: React.FC = () => {
    const headings = ['display', 'h1', 'h2'] as const
    const variants = ['body', 'caption', 'small', 'tiny'] as const
    const weights = ['normal', 'medium', 'bold'] as const

    return (
        <Container>
            <TextGroup>
                {headings.map(heading => (
                    <Text key={heading} variant={heading}>
                        Heading variant {heading}
                    </Text>
                ))}
            </TextGroup>

            {variants.map(variant => (
                <TextGroup key={variant}>
                    {weights.map(weight => (
                        <Text key={weight} variant={variant} weight={weight}>
                            Text variant {variant} ({weight})
                        </Text>
                    ))}
                </TextGroup>
            ))}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const TextGroup = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})
