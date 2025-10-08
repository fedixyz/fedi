import { styled } from '@stitches/react'

import { theme } from '../styles'
import { Row } from './Flex'

function AvatarStack<T>({
    size,
    stackDirection = 'ltr',
    data,
    renderAvatar,
}: {
    size: number
    stackDirection?: 'ltr' | 'rtl'
    data: Array<T>
    renderAvatar: (item: T, size: number) => React.ReactNode
}) {
    return (
        <Container
            style={{
                width: size + (data.length - 1) * (size / 2),
                height: size,
            }}>
            {data.map((item, i) => (
                <AvatarCell
                    center
                    key={`avatar-stack-${i}`}
                    style={{
                        left: (i * size) / 2,
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        zIndex:
                            stackDirection === 'rtl'
                                ? data.length - i
                                : undefined,
                    }}>
                    {renderAvatar(item, size)}
                </AvatarCell>
            ))}
        </Container>
    )
}

const Container = styled('div', {
    position: 'relative',
})

const AvatarCell = styled(Row, {
    position: 'absolute',
    top: 0,
    borderWidth: 1,
    borderColor: theme.colors.white,
    overflow: 'hidden',
    backgroundColor: theme.colors.red,
})

export default AvatarStack
