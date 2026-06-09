import { expect } from '@playwright/test'

import { BasePage } from './base.page'

export class OnboardingPage extends BasePage {
    async completeWithNewSeed() {
        await this.goto('/')
        const getStarted = this.page.getByRole('button', {
            name: 'Get started',
            exact: true,
        })
        await expect(getStarted).toBeVisible({ timeout: 30_000 })
        await getStarted.click()
        await this.waitForUrl('**/wallet', 120_000)
    }
}
