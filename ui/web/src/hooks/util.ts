import { useContext, useEffect, useState } from 'react'

import { useNuxStep } from '@fedi/common/hooks/nux'

import { InstallPromptContext } from '../context/InstallPromptContext'
import { config } from '../styles'

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        const media = window.matchMedia(query)
        setMatches(media.matches)
        const listener = () => setMatches(media.matches)
        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
    }, [matches, query])

    return matches
}

export function useCopy() {
    const [copied, setCopied] = useState<boolean>(false)

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)

            setTimeout(() => {
                setCopied(false)
            }, 2000) // 2 second delay
        } catch {
            setCopied(false)
        }
    }

    return { copy, copied }
}

// Whereas useMediaQuery can be used to tell if a user is viewing
// in a mobile sized window, this hook will look at the userAgent string
// This means that this will return false for a narrow window in a desktop browser
export function useDeviceQuery() {
    const [isMobile, setIsMobile] = useState<boolean>(false)
    const [isIOS, setIsIOS] = useState<boolean>(false)

    useEffect(() => {
        if (!window) return

        const userAgentString = window.navigator?.userAgent

        const isAppleDevice = /iPhone|iPad|iPod/i.test(userAgentString)
        const isAndroidDevice = /Android/i.test(userAgentString)

        setIsMobile(isAppleDevice || isAndroidDevice)
        setIsIOS(isAppleDevice)
    }, [])

    return { isMobile, isIOS }
}

export function useInstallPromptContext() {
    const deferredPrompt = useContext(InstallPromptContext)
    return deferredPrompt
}

export function useInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] =
        useState<BeforeInstallPromptEvent>()

    useEffect(() => {
        const handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
            event.preventDefault()
            setDeferredPrompt(event)
        }

        window.addEventListener(
            'beforeinstallprompt',
            handleBeforeInstallPrompt,
        )

        return () =>
            window.removeEventListener(
                'beforeinstallprompt',
                handleBeforeInstallPrompt,
            )
    }, [])

    return deferredPrompt
}

export function useShowInstallPromptBanner() {
    const { isMobile } = useDeviceQuery()
    const isStandalone = useMediaQuery(config.media.standalone)

    const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false)

    const [hasDismissedInstallPrompt, completeHasDismissedInstallPrompt] =
        useNuxStep('pwaHasDismissedInstallPrompt')

    useEffect(() => {
        setShowInstallBanner(
            isMobile && !isStandalone && !hasDismissedInstallPrompt,
        )
    }, [isMobile, isStandalone, hasDismissedInstallPrompt])

    return {
        showInstallBanner,
        handleOnDismiss: completeHasDismissedInstallPrompt,
    }
}
