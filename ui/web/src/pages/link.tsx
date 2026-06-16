import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'
import { normalizeDeepLink } from '@fedi/common/utils/linking'

import { DeeplinkHeroLayout } from '../components/DeeplinkPageLayout'
import { useDeviceQuery } from '../hooks'
import i18n, { detectBrowserLanguage } from '../localization/i18n'
import { getDeepLinkPath } from '../utils/linking'
import { setPendingDeeplink } from '../utils/localstorage'

/*
 * Deeplinking flow for new users (via web)
 * 1. User visits Fedi deeplink e.g. /link?screen=join&id=fed1... (this is a deeplink to join a federation)
 * 2. Page stores the deeplink so the native app can return via /deeplink-redirect after install
 * 3. User taps the Fedi deeplink button to open the app, or downloads it from the app store
 * 4. User returns via /deeplink-redirect and the stored deeplink is replayed
 */

const openDeepLinkInFedi = (href: string) => {
    const normalized = normalizeDeepLink(href)
    if (!normalized) return

    window.location.href = normalized.fediUri
}

const LinkingPage: NextPage = () => {
    const { t } = useTranslation()
    const { replace } = useRouter()
    const { isMobile } = useDeviceQuery()

    const [loaded, setLoaded] = useState(false)
    const [languageLoaded, setLanguageLoaded] = useState(false)

    useEffect(() => {
        i18n.changeLanguage(detectBrowserLanguage()).finally(() => {
            setLanguageLoaded(true)
        })
    }, [])

    useEffect(() => {
        if (
            typeof window === 'undefined' ||
            isMobile === undefined ||
            !languageLoaded
        )
            return

        if (!isMobile) {
            replace(getDeepLinkPath(window.location.href))
            return
        }

        const href = window.location.href
        const normalized = normalizeDeepLink(href)

        if (!normalized) {
            replace('/')
            return
        }

        setPendingDeeplink(href)
        setLoaded(true)
    }, [isMobile, languageLoaded, replace, t])

    const handleDownloadApp = () => {
        const ua = window.navigator.userAgent || ''

        if (/iPhone|iPad|iPod/i.test(ua)) {
            window.open(IOS_APP_STORE_URL, '_blank')
        } else if (/Android/i.test(ua)) {
            window.open(
                `${ANDROID_PLAY_STORE_URL}&referrer=${encodeURIComponent(window.location.href)}`,
                '_blank',
            )
        }
    }

    if (!loaded) return null

    return (
        <DeeplinkHeroLayout
            onClick={() => openDeepLinkInFedi(window.location.href)}
            onDownload={handleDownloadApp}
        />
    )
}

// Means we don't load bridge so page can load fast
LinkingPage.noProviders = true

export default LinkingPage
