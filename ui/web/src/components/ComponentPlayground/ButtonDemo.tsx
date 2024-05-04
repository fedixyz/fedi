import React, { useState } from 'react'

import cogIcon from '@fedi/common/assets/svgs/cog.svg'

import { Button } from '../../components/Button'
import { styled } from '../../styles'

export const ButtonDemo: React.FC = () => {
    const sizes = ['md', 'sm'] as const
    const variants = ['primary', 'secondary', 'tertiary', 'outline'] as const
    const [isLoading, setIsLoading] = useState(false)
    const [isDisabled, setIsDisabled] = useState(false)

    const toggleLoading = () => {
        setIsLoading(is => !is)
    }

    const toggleDisabled = () => {
        setIsDisabled(is => !is)
    }

    return (
        <Container>
            <ButtonRow>
                <button onClick={toggleLoading}>Toggle loading</button>
                <button onClick={toggleDisabled}>Toggle disabled</button>
            </ButtonRow>
            {sizes.map(size => (
                <ButtonGroup key={size}>
                    {variants.map(variant => (
                        <React.Fragment key={variant}>
                            <ButtonRow>
                                <Button
                                    size={size}
                                    variant={variant}
                                    loading={isLoading}
                                    disabled={isDisabled}>
                                    Button {size} {variant}
                                </Button>
                                <Button
                                    size={size}
                                    variant={variant}
                                    icon={cogIcon}
                                    loading={isLoading}
                                    disabled={isDisabled}>
                                    Button {size} {variant}
                                </Button>
                                <Button
                                    size={size}
                                    variant={variant}
                                    href="/playground"
                                    loading={isLoading}
                                    disabled={isDisabled}>
                                    Button link
                                </Button>
                            </ButtonRow>
                        </React.Fragment>
                    ))}
                </ButtonGroup>
            ))}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
})

const ButtonGroup = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const ButtonRow = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
})
