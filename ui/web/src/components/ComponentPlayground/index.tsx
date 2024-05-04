import React from 'react'

import { Text } from '../../components/Text'
import { styled } from '../../styles'
import { ContentBlock } from '../ContentBlock'
import { AvatarDemo } from './AvatarDemo'
import { ButtonDemo } from './ButtonDemo'
import { DialogDemo } from './DialogDemo'
import { FormDemo } from './FormDemo'
import { IconDemo } from './IconDemo'
import { OmniInputDemo } from './OmniInputDemo'
import { TextDemo } from './TextDemo'
import { ToastDemo } from './ToastDemo'

export const ComponentPlayground: React.FC = () => {
    const demos = [
        {
            title: 'Omni Input',
            content: <OmniInputDemo />,
        },
        {
            title: 'Text',
            content: <TextDemo />,
        },
        {
            title: 'Button',
            content: <ButtonDemo />,
        },
        {
            title: 'Form fields',
            content: <FormDemo />,
        },
        {
            title: 'Avatar',
            content: <AvatarDemo />,
        },
        {
            title: 'Icons',
            content: <IconDemo />,
        },
        {
            title: 'Dialog',
            content: <DialogDemo />,
        },
        {
            title: 'Toast',
            content: <ToastDemo />,
        },
    ]

    return (
        <Container>
            {demos.map(demo => (
                <ContentBlock
                    key={demo.title}
                    css={{ maxWidth: 1120, flex: 'none' }}>
                    <Title>
                        <Text variant="h1">{demo.title}</Text>
                    </Title>
                    <DemoContent>{demo.content}</DemoContent>
                </ContentBlock>
            ))}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: '100%',
    overflow: 'auto',
})

const Title = styled('div', {
    position: 'relative',
    width: '100%',
    paddingBottom: 8,
    marginBottom: 24,

    '@sm': {
        padding: '8px 24px',
    },

    '&:after': {
        content: '',
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: 4,
        holoGradient: '900',
    },
})

const DemoContent = styled('div', {
    flexShrink: 0,
    marginTop: 20,

    '@sm': {
        padding: 16,
    },
})
