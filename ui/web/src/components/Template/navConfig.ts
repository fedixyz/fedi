import { useRouter } from 'next/router'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'

import { useMediaQuery } from '../../hooks'
import { config } from '../../styles'

/**
 * An array of routes or route prefixes that will set the navigation visibility.
 *
 * If `showWhen` is unset, navigation will be hidden for that route.
 * Navigation visibility can be explicitly set with `showWhen`.
 *
 * Absolute routes are prioritized over prefixes.
 * Longer routes are prioritized over shorter routes.
 */
const navRoutes: Array<PrefixRoute | AbsoluteRoute> = [
    {
        prefix: '/chat/room',
        showWhen: 'desktop',
    },
    {
        prefix: '/settings/backup',
        showWhen: 'desktop',
    },
    {
        prefix: '/onboarding',
    },
    {
        prefix: '/chat/new',
        showWhen: 'desktop',
    },
    {
        path: '/bug-report',
        showWhen: 'desktop',
    },
    {
        path: '/transactions',
        showWhen: 'desktop',
    },
    {
        path: '/settings/app',
        showWhen: 'desktop',
    },
    {
        path: '/settings/language',
        showWhen: 'desktop',
    },
    {
        path: '/settings/currency',
        showWhen: 'desktop',
    },
]

/**
 * The logic for displaying the navigation component based on the current route and `navRoutes`.
 */
export function useNavVisibility() {
    const isSm = useMediaQuery(config.media.sm)
    const popupInfo = usePopupFederationInfo()
    const router = useRouter()

    const isPopupOver = !!popupInfo && popupInfo.secondsLeft <= 0

    const matched = navRoutes
        .sort((a, b) => {
            // If using a prefix, prioritize deeper routes
            if ('prefix' in a && 'prefix' in b)
                return b.prefix.split('/').length - a.prefix.split('/').length

            return 0
        })
        .find(route => {
            if ('path' in route) {
                return router.asPath !== '/' && router.asPath === route.path
            } else {
                return (
                    router.asPath !== '/' &&
                    router.asPath.startsWith(route.prefix)
                )
            }
        })

    if (!matched) return { hideNavigation: false, isPopupOver }

    let shouldShowNavigation = false
    switch (matched.showWhen) {
        case 'always':
            shouldShowNavigation = true
            break
        case 'desktop':
            shouldShowNavigation = !isSm
            break
        case 'mobile':
            shouldShowNavigation = isSm
            break
    }

    return { hideNavigation: !shouldShowNavigation || isPopupOver, isPopupOver }
}

interface PrefixRoute {
    prefix: string
    showWhen?: 'always' | 'desktop' | 'mobile'
}

interface AbsoluteRoute {
    path: string
    showWhen?: 'always' | 'desktop' | 'mobile'
}
