import { HomeNavigationTab } from '@fedi/common/types/linking'

import * as routes from '../constants/routes'
import { getHashParams } from './linking'

export const shouldHideNavigation = (pathname: string) => {
    // strip out any query string and hash params
    // could be more robust but is good enough for now
    // only interested in the left side of the split
    const [path] = pathname.split(/[?#]/)

    // hide nav for welcome page
    if (path === routes.welcomeRoute) return true

    // hide nav for ecash page
    if (path === routes.ecashRoute) return true

    // hide nav for onboarding routes
    if (path.includes(routes.onboardingRoute)) return true

    // If any settings page (including root) then hide
    if (path.includes(`${routes.settingsRoute}`)) return true

    // If chat/* then hide
    if (path.includes(`${routes.chatRoute}/`)) return true

    // If federations/* then hide
    if (path.includes(`${routes.walletRoute}/`)) return true

    // If communities/* then hide
    if (path.includes(`${routes.communitiesRoute}/`)) return true

    if (path === routes.shareLogsRoute) return true

    if (path === routes.transactionsRoute) return true

    if (path === routes.sendRoute) return true
    if (path === routes.requestRoute) return true

    return false
}

export const tabRedirectPath = (lastUsedTab: HomeNavigationTab) => {
    switch (lastUsedTab) {
        case HomeNavigationTab.Home:
            return routes.homeRoute
        case HomeNavigationTab.Wallet:
            return routes.walletRoute
        case HomeNavigationTab.MiniApps:
            return routes.miniAppsRoute
        case HomeNavigationTab.Chat:
            return routes.chatRoute
    }
}

export const getRecoveryRedirectPath = ({
    asPath,
    pathname,
    deviceIndexRequired,
    socialRecoveryId,
}: {
    asPath: string
    pathname: string
    deviceIndexRequired: boolean
    socialRecoveryId?: unknown
}) => {
    // Navigates to personal recovery flow here because the user entered
    // seed words but quit the app before completing device index selection
    if (
        deviceIndexRequired &&
        asPath !== routes.onboardingRecoverWalletTransferRoute &&
        !asPath.includes('recover')
    ) {
        return routes.onboardingRecoverWalletTransferRoute
    }

    // If mid social recovery, force them to stay on the page
    if (
        socialRecoveryId &&
        pathname !== '/' &&
        !asPath.includes(routes.onboardingRecoverRoute)
    ) {
        return routes.onboardingRecoverSocialRoute
    }
}

export const getRedirectPath = ({
    asPath,
    pathname,
    hasLoadedStorage,
    lastUsedTab,
}: {
    asPath: string
    pathname: string
    hasLoadedStorage: boolean
    lastUsedTab: HomeNavigationTab
}) => {
    if (pathname !== '/' || !hasLoadedStorage) return

    const { screen, id } = getHashParams(asPath)

    if (screen) {
        let path = `/${screen}`

        if (id) {
            // Ecash screen must use hash params to avoid sending raw ecash to server
            const delimiter = screen === 'ecash' ? '#' : '?'
            path += `${delimiter}id=${id}`
        }

        return path
    }

    return tabRedirectPath(lastUsedTab)
}

export const getUnauthenticatedRedirectPath = ({
    asPath,
    pathname,
    href,
}: {
    asPath: string
    pathname: string
    href: string
}) => {
    if (pathname === '/' || asPath.includes('recover')) return

    // Preserve any query string or hash params when redirecting to Welcome/Splash page
    const url = new URL(href)
    const screen = url.pathname.replace(/^\/+/, '')
    const id = url.searchParams.get('id') ?? getHashParams(url.hash).id

    const params = new URLSearchParams({ screen })

    if (id) {
        params.set('id', id)
    }

    return `/#${params.toString()}`
}
