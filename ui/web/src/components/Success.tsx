import React from 'react'

import CheckIcon from '@fedi/common/assets/svgs/check.svg'
import CloseIcon from '@fedi/common/assets/svgs/close.svg'

import * as Layout from '../components/Layout'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { Column } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

type Props = {
    title: string
    description?: string
    buttonText: string
    onClick(): void
    type?: 'success' | 'error'
}

const Success: React.FC<Props> = ({
    title,
    description,
    buttonText,
    onClick,
    type = 'success',
}) => {
    return (
        <Layout.Root>
            <Layout.Content centered>
                <Content>
                    <Circle align="center" gap="md">
                        <Icon
                            size="md"
                            icon={type === 'success' ? CheckIcon : CloseIcon}
                        />
                        <Text weight="bold">{title}</Text>
                        <Text
                            variant="caption"
                            css={{ color: theme.colors.darkGrey }}>
                            {description}
                        </Text>
                    </Circle>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button width="full" onClick={onClick}>
                    {buttonText}
                </Button>
            </Layout.Actions>
        </Layout.Root>
    )
}

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
})

const Circle = styled(Column, {
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    border: `1px solid ${theme.colors.lightGrey}`,
    borderRadius: '50%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    height: '300px',
    justifyContent: 'center',
    width: '300px',
})

export default Success
