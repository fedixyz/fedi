import React, { useState } from 'react'

import { useToast } from '@fedi/common/hooks/toast'

import { Button } from '../../components/Button'
import { styled } from '../../styles'
import { Input } from '../Input'

export const ToastDemo: React.FC = () => {
    const [content, setContent] = useState(
        'Failed to toast, requires at least one toaster to be available.',
    )
    const toast = useToast()

    return (
        <Container>
            <Input
                label="content"
                value={content}
                onChange={ev => setContent(ev.currentTarget.value)}
            />
            <Button variant="primary" onClick={() => toast.show({ content })}>
                Open toast
            </Button>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    maxWidth: 320,
    flexDirection: 'column',
    gap: 16,
})
