import { Page, expect } from '@playwright/test'

export class BasePage {
    constructor(readonly page: Page) {}

    goto(path: string) {
        return this.page.goto(path)
    }

    waitForUrl(pattern: string | RegExp, timeout = 30_000) {
        return this.page.waitForURL(pattern, { timeout })
    }

    waitForLink(name: string, timeout = 15_000) {
        return expect(
            this.page.getByRole('link', { name, exact: true }),
        ).toBeVisible({ timeout })
    }
}
