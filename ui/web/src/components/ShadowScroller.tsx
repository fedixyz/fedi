import React, { useEffect, useImperativeHandle, useState } from 'react'

import { styled, theme } from '../styles'

export const ShadowScroller = React.forwardRef<
    React.ElementRef<'div'> | null,
    React.ComponentPropsWithoutRef<'div'>
>(({ children, ...props }, forwardedRef) => {
    const [canScrollDown, setCanScrollDown] = useState(false)
    const [canScrollUp, setCanScrollUp] = useState(false)
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

    useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
        forwardedRef,
        () => containerEl,
    )

    // Bind listeners to things that would change scroll states, update on changes
    useEffect(() => {
        if (!containerEl) return
        const contentEl = containerEl.childNodes[0] as HTMLElement
        const isReverse =
            getComputedStyle(contentEl).flexDirection === 'column-reverse'
        const checkContentScroll = () => {
            const padding = 5
            if (isReverse) {
                setCanScrollDown(contentEl.scrollTop + padding < 0)
                setCanScrollUp(
                    contentEl.scrollHeight + contentEl.scrollTop >
                        contentEl.clientHeight + padding,
                )
            } else {
                setCanScrollDown(
                    contentEl.scrollHeight - contentEl.scrollTop >
                        contentEl.clientHeight + padding,
                )
                setCanScrollUp(contentEl.scrollTop - padding > 0)
            }
        }

        const resizeObserver = new ResizeObserver(checkContentScroll)

        contentEl.addEventListener('scroll', checkContentScroll)
        resizeObserver.observe(contentEl)
        checkContentScroll()

        return () => {
            contentEl.removeEventListener('scroll', checkContentScroll)
            resizeObserver.disconnect()
        }
    }, [containerEl, children])

    return (
        <Container ref={setContainerEl} {...props}>
            {children}
            <Shadow position="top" visible={canScrollUp} />
            <Shadow position="bottom" visible={canScrollDown} />
        </Container>
    )
})
ShadowScroller.displayName = 'ShadowScroller'

const Container = styled('div', {
    position: 'relative',
    overflow: 'hidden',
})

const Shadow = styled('div', {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 24,
    background: `linear-gradient(${theme.colors.primary10}, transparent)`,
    opacity: 0,
    transform: 'scaleY(0)',
    transition: 'transform 100ms ease, opacity 100ms ease',
    pointerEvents: 'none',
    zIndex: 1,

    variants: {
        position: {
            top: {
                top: 0,
                transformOrigin: 'top center',
                background: `linear-gradient(to bottom, ${theme.colors.primary05}, transparent)`,
            },
            bottom: {
                bottom: 0,
                transformOrigin: 'bottom center',
                background: `linear-gradient(to top, ${theme.colors.primary05}, transparent)`,
            },
        },
        visible: {
            true: {
                transform: 'scaleY(1)',
                opacity: 1,
            },
        },
    },
})
