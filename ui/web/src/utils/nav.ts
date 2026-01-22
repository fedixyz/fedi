import * as routes from '../constants/routes'

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

    if (path === routes.shareLogsRoute) return true

    if (path === routes.transactionsRoute) return true

    return false
}
