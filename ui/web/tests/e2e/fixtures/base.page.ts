import { Frame, Page, expect } from '@playwright/test'

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

    // Click the welcome screen's "Get started" CTA to create a seed. Both fresh
    // onboarding and the resumed deep-link join begin here, so it is shared to
    // keep the two flows from drifting if the welcome screen changes.
    async startOnboardingFromWelcome() {
        const getStarted = this.page.getByRole('button', {
            name: 'Get started',
            exact: true,
        })
        await expect(getStarted).toBeVisible({ timeout: 30_000 })
        await getStarted.click()
    }

    // Wait for an embedded iframe whose URL matches (e.g. a mini app opened in
    // the in-app browser) and return its Frame so a test can drive it.
    async waitForFrame(urlPattern: RegExp, timeout = 30_000): Promise<Frame> {
        await expect
            .poll(
                () => this.page.frames().some(f => urlPattern.test(f.url())),
                {
                    timeout,
                },
            )
            .toBe(true)
        const frame = this.page.frames().find(f => urlPattern.test(f.url()))
        if (!frame) throw new Error(`no frame matching ${urlPattern}`)
        return frame
    }

    // Read the clipboard, retrying until it satisfies predicate. An async
    // writeText() may not have settled by the time a click() returns.
    async readClipboardWhen(
        predicate: (text: string) => boolean,
        timeout = 15_000,
    ): Promise<string> {
        let text = ''
        await expect
            .poll(
                async () => {
                    text = (
                        await this.page.evaluate(() =>
                            navigator.clipboard.readText(),
                        )
                    ).trim()
                    return predicate(text)
                },
                { timeout },
            )
            .toBe(true)
        return text
    }
}
