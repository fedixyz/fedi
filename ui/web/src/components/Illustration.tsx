import Image, { ImageProps } from 'next/image'
import React from 'react'

import { styled } from '../styles'

export const Illustration: React.FC<ImageProps> = props => {
    return (
        <Container>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image {...props} />
        </Container>
    )
}

const Container = styled('div', {
    position: 'relative',
    height: '100%',
    width: '100%',

    '&:after': {
        content: '',
        position: 'absolute',
        top: 30,
        left: 30,
        right: 30,
        bottom: 30,
        holoGradient: '900',
        borderRadius: '100%',
        filter: 'blur(10px)',
    },

    '& img': {
        height: '100%',
        width: '100%',
    },
})
