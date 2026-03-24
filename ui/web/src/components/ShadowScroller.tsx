import React, { useImperativeHandle, useState } from 'react'

import { styled } from '../styles'

export const ShadowScroller = React.forwardRef<
    React.ElementRef<'div'> | null,
    React.ComponentPropsWithoutRef<'div'>
>(({ children, ...props }, forwardedRef) => {
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

    useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
        forwardedRef,
        () => containerEl,
    )

    return (
        <Container ref={setContainerEl} {...props}>
            {children}
        </Container>
    )
})

ShadowScroller.displayName = 'ShadowScroller'

const Container = styled('div', {
    position: 'relative',
    overflow: 'hidden',
})
