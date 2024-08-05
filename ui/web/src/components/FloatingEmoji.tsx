import React from 'react'

import { styled } from '../styles'
import { Text } from './Text'

/*
    UI Component: FloatingEmoji

    Renders the provided string into a rounded floating
    container intended for 1-character emojis. Though this
    is not enforced in the component

    size can be any number and will render as the font size
    of the emoji

    <FloatingEmoji emoji="🌎" size={20}/>
*/

type FloatingEmojiProps = {
    emoji: string
    size: number
}

const FloatingEmoji: React.FC<FloatingEmojiProps> = ({
    emoji,
    size,
}: FloatingEmojiProps) => {
    const height = size * 2
    const width = height
    const borderRadius = height * 0.5
    const fontSize = size

    return (
        <FloatingContainer css={{ height, width, borderRadius }}>
            <Text css={{ fontSize }}>{emoji}</Text>
        </FloatingContainer>
    )
}

const FloatingContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    boxShadow:
        '0px 7px 11px rgba(1, 153, 176, 0.06), 0px 16px 40px rgba(112, 153, 176, 0.16)',
})

export default FloatingEmoji
