import { test as base } from '@playwright/test'

import { CommunityToolPage } from './community-tool.page'
import { OnboardingJoinPage } from './onboarding-join.page'
import { OnboardingPage } from './onboarding.page'

type Fixtures = {
    onboarding: OnboardingPage
    communityTool: CommunityToolPage
    onboardingJoin: OnboardingJoinPage
}

// Page-object fixtures so specs skip `new XPage(page)` boilerplate. onboardingJoin
// runs as a second, brand-new user in its own context, which is closed on
// teardown (so a failed assertion can't leak it).
export const test = base.extend<Fixtures>({
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
})

export { expect } from '@playwright/test'
