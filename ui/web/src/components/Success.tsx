import React from 'react'

import CheckIcon from '@fedi/common/assets/svgs/check.svg'

import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { Icon } from './Icon'

type Props = {
    title: string
    description?: string
    buttonText: string
    onClick(): void
}

const Success: React.FC<Props> = ({
    title,
    description,
    buttonText,
    onClick,
}) => {
    return (
        <ContentBlock css={{ holoGradient: '400' }}>
            <Layout.Root>
                <Layout.Content centered>
                    <Content>
                        <Zone>
                            <Icon size="md" icon={CheckIcon} />
                            <Title>{title}</Title>
                            <Description>{description}</Description>
                        </Zone>
                    </Content>
                </Layout.Content>
                <Layout.Actions>
                    <Button width="full" onClick={onClick}>
                        {buttonText}
                    </Button>
                </Layout.Actions>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
})

const Zone = styled('div', {
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: '50%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    height: '300px',
    justifyContent: 'center',
    width: '300px',
})

const Title = styled('h4', {
    fontSize: '16px',
})

const Description = styled('p', {
    color: theme.colors.darkGrey,
})

export default Success
