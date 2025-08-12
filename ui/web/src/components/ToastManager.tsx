import * as Portal from '@radix-ui/react-portal'
import * as RadixToast from '@radix-ui/react-toast'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import Close from '@fedi/common/assets/svgs/close.svg'
import { useToast } from '@fedi/common/hooks/toast'
import { selectToast } from '@fedi/common/redux'

import { useAppSelector, useMediaQuery } from '../hooks'
import { config, keyframes, styled, theme } from '../styles'
import { Icon } from './Icon'
import { Text } from './Text'

export const ToastManager: React.FC = () => {
    const toast = useAppSelector(selectToast)
    const toastElRef = useRef<HTMLLIElement>(null)
    const [cachedToast, setCachedToast] = useState(toast)
    const [isToastOpen, setIsToastOpen] = useState(!!toast)
    const { close } = useToast()
    const isMobile = useMediaQuery(config.media.md)

    const router = useRouter()

    const handleCloseToast = useCallback(
        (open: boolean) => {
            setIsToastOpen(open)
            if (!open) close(toast?.key)
        },
        [toast, close],
    )

    useEffect(() => {
        if (toast) {
            setCachedToast(toast)
            setIsToastOpen(true)
        } else {
            setIsToastOpen(false)
        }
    }, [toast])

    useEffect(() => {
        router.events.on('routeChangeComplete', close)

        return () => {
            router.events.off('routeChangeComplete', close)
        }
    }, [router, close])

    return (
        <Portal.Root>
            <RadixToast.Provider
                duration={3000}
                swipeDirection={isMobile ? 'up' : 'right'}>
                <Toast
                    key={cachedToast?.key}
                    ref={toastElRef}
                    open={isToastOpen}
                    onOpenChange={handleCloseToast}>
                    {cachedToast && (
                        <ToastInner>
                            <ToastIcon>
                                {cachedToast?.status === 'success'
                                    ? '👍'
                                    : cachedToast?.status === 'info'
                                      ? '👀'
                                      : '⚠️'}
                            </ToastIcon>
                            <Description>
                                <Text variant="caption">
                                    {cachedToast.content}
                                </Text>
                            </Description>
                            <CloseIcon onClick={() => handleCloseToast(false)}>
                                <Icon icon={Close} />
                            </CloseIcon>
                        </ToastInner>
                    )}
                </Toast>
                <Viewport />
            </RadixToast.Provider>
        </Portal.Root>
    )
}

const toastSlideLeft = keyframes({
    '0%': { transform: 'translateX(100%) translateX(20px)' },
    '100%': { transform: 'translateX(0)' },
})

const toastSwipeRight = keyframes({
    '0%': { transform: 'translateX(var(--radix-toast-swipe-end-x))' },
    '100%': { transform: 'translateX(100%) translateX(20px)' },
})

const toastSlideDown = keyframes({
    '0%': { transform: 'translateY(-100%) translateY(-32px)' },
    '100%': { transform: 'translateY(0)' },
})

const toastSwipeUp = keyframes({
    '0%': { transform: 'translateY(var(--radix-toast-swipe-end-y))' },
    '100%': { transform: 'translateY(-100%) translateY(-32px)' },
})

const toastFadeOut = keyframes({
    '0%': { opacity: 1 },
    '100%': { opacity: 0 },
})

const CloseIcon = styled('div', {
    color: theme.colors.grey,
    cursor: 'pointer',
    display: 'flex',
    flexShrink: 0,
    fontSize: 20,
    height: 20,
    placeItems: 'center',
    width: 20,
})

const ToastIcon = styled(Text, {
    fontSize: '20px !important',
    flexShrink: 0,
})

const Description = styled(RadixToast.Description, {
    flexGrow: 1,
})

const Toast = styled(RadixToast.Root, {
    width: '100%',
    borderRadius: 16,
    backgroundColor: theme.colors.black,
    backgroundImage:
        'linear-gradient(180deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0))',
    textAlign: 'left',
    boxShadow: `0px 2px 4px 0px #00000026, 0px 7px 7px 0px #00000021, 0px 16px 10px 0px #00000014, 0px 29px 12px 0px #00000005, 0px 46px 13px 0px #00000000`,

    '&[data-state="open"]': {
        animation: `${toastSlideLeft} 150ms ease-out`,
    },
    '&[data-state="closed"]': {
        animation: `${toastFadeOut} 150ms ease-in`,
    },
    '&[data-swipe="move"]': {
        transform: 'translateX(var(--radix-toast-swipe-move-x))',
    },
    '&[data-swipe="cancel"]': {
        transform: 'translateX(0)',
        transition: 'transform 150ms ease-out',
    },
    '&[data-swipe="end"]': {
        animation: `${toastSwipeRight} 100ms ease-out`,
    },

    '@md': {
        '&[data-state="open"]': {
            animationName: toastSlideDown,
        },
        '&[data-swipe="move"]': {
            transform: 'translateY(var(--radix-toast-swipe-move-y))',
        },
        '&[data-swape="cancel"]': {
            transform: 'translateY(0)',
        },
        '&[data-swipe="end"]': {
            animationName: toastSwipeUp,
        },
    },
})

const ToastInner = styled('div', {
    display: 'flex',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    holoGradient: '400',
    alignItems: 'center',
    color: theme.colors.white,
})

const Viewport = styled(RadixToast.Viewport, {
    position: 'fixed',
    top: 32,
    right: 20,
    width: '100%',
    maxWidth: 320,
    padding: 0,
    zIndex: 2147483647, // max
    listStyle: 'none',
    outline: 'none',

    '@md': {
        display: 'flex',
        justifyContent: 'center',
        bottom: 'auto',
        right: 'auto',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
    },

    '@xs': {
        width: 'calc(100% - 24px)',
    },
})
