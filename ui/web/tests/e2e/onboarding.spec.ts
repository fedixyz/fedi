import { test } from '@playwright/test'

import { OnboardingPage } from './fixtures/onboarding.page'

test('onboards a new user to the wallet page', async ({ page }) => {
    const onboarding = new OnboardingPage(page)
    await onboarding.completeWithNewSeed()
    await onboarding.waitForLink('Wallet')
    await onboarding.waitForLink('Chat')
    await onboarding.waitForLink('Mini Apps')
    await onboarding.waitForLink('Spaces')
})
