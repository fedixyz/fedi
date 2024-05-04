import React from 'react'

import { keyframes, styled, theme } from '../styles'

interface Props {
    visible: boolean
    children: React.ReactNode
    size?: number
    offset?: number
}

export const NotificationDot: React.FC<Props> = ({
    visible,
    children,
    offset = 0,
    size = 12,
}) => {
    return (
        <Container>
            {children}
            {visible && (
                <Dot
                    css={{
                        top: offset,
                        right: offset,
                        width: size,
                        height: size,
                    }}
                />
            )}
        </Container>
    )
}

const Container = styled('div', {
    position: 'relative',
})

const dotPop = keyframes({
    from: { transform: 'scale(0)' },
    to: { transform: 'scale(1)' },
})

const Dot = styled('div', {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: theme.colors.red,
    border: `2px solid ${theme.colors.white}`,
    animation: `${dotPop} 200ms cubic-bezier(0.250, 0.250, 0.315, 1.325)`,
})
