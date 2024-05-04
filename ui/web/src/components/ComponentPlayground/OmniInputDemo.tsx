import React from 'react'

import { styled } from '../../styles'
import { OmniInput } from '../OmniInput'

export const OmniInputDemo: React.FC = () => {
    return (
        <Container>
            <OmniInput
                expectedInputTypes={[]}
                onExpectedInput={() => null}
                onUnexpectedSuccess={() => alert('Success!')}
            />
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
})
