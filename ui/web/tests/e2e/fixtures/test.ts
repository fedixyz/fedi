import { Page, test as base } from '@playwright/test'

import { ChatPage } from './chat.page'
import { CommunityToolPage } from './community-tool.page'
import { OnboardingJoinPage } from './onboarding-join.page'
import { OnboardingPage } from './onboarding.page'

type Fixtures = {
    onboarding: OnboardingPage
    communityTool: CommunityToolPage
    onboardingJoin: OnboardingJoinPage
    chat: ChatPage
    knockerChat: ChatPage
}

// The analytics consent modal mounts over the app at an unpredictable moment
// once a session crosses its usage threshold, swallowing clicks and
// aria-hiding the page. A locator handler declines it whenever it blocks an
// interaction, at whatever point it appears.
async function autoDeclineAnalyticsConsent(page: Page) {
    const notNow = page.getByRole('button', { name: 'Not now', exact: true })
    await page.addLocatorHandler(notNow, () => notNow.click())
}

// Page-object fixtures so specs skip `new XPage(page)` boilerplate. onboardingJoin
// and knockerChat each run as a second, brand-new user in their own context,
// which is closed on teardown (so a failed assertion can't leak it).
export const test = base.extend<Fixtures>({
    page: async ({ page }, use) => {
        await autoDeclineAnalyticsConsent(page)
        await use(page)
    },
    onboarding: async ({ page }, use) => {
        await use(new OnboardingPage(page))
    },
    communityTool: async ({ page }, use) => {
        await use(new CommunityToolPage(page))
    },
    onboardingJoin: async ({ browser }, use) => {
        const context = await browser.newContext()
        await use(new OnboardingJoinPage(await context.newPage()))
        await context.close()
    },
    chat: async ({ page }, use) => {
        await use(new ChatPage(page))
    },
    knockerChat: async ({ browser }, use) => {
        const context = await browser.newContext()
        const page = await context.newPage()
        await autoDeclineAnalyticsConsent(page)
        await use(new ChatPage(page))
        await context.close()
    },
})

export { expect } from '@playwright/test'
