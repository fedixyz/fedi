import { Frame, expect } from '@playwright/test'

import { BasePage } from './base.page'

// Drives the community creation tool, which the app loads as a cross-origin
// iframe (community-tool-two.vercel.app) inside its in-app browser. Playwright
// reaches the embedded DOM directly via page.frames(). Driving a third-party
// site is normally avoided; it is intentional here, the in-app browser is the
// surface under test and backs every mini app.
export class CommunityToolPage extends BasePage {
    // Publishes a minimal community (name + welcome message only) and returns
    // its invite code, read from the clipboard via the tool's "Copy Invite"
    // (clipboard permission is granted globally in playwright.config.ts).
    // Call on the post-onboarding wallet.
    async createSpace(name: string): Promise<string> {
        await this.page
            .getByRole('link', { name: 'Spaces', exact: true })
            .click()
        await this.page.waitForURL('**/home', { timeout: 30_000 })
        await this.page.getByTestId('MainHeaderButtons__AddIcon').click()
        await this.page.waitForURL('**/onboarding/communities**', {
            timeout: 30_000,
        })
        await this.page.getByTestId('createTab').click()
        await this.page
            .getByRole('button', { name: 'Create my Space', exact: true })
            .click()

        const tool = await this.waitForFrame(/community-tool/, 60_000)
        const start = tool
            .getByRole('button', { name: 'Create a Space', exact: true })
            .first()
        // The tool is a third-party app loaded over the network; give its
        // landing screen room to come up before driving the wizard.
        await expect(start).toBeVisible({ timeout: 60_000 })
        await start.click()

        // Step 1, the only required fields.
        await tool.locator('#name').fill(name)
        await tool.locator('#welcome').fill(`Welcome to ${name}`)

        // Skip the optional Mini Apps and Group Chat steps, then publish.
        await this.next(tool)
        await expect(
            tool.getByRole('button', { name: 'Add Mini App', exact: true }),
        ).toBeVisible()
        await this.next(tool)
        const publish = tool.getByRole('button', {
            name: 'Publish',
            exact: true,
        })
        await expect(publish).toBeVisible()
        await publish.click()
        await tool.getByRole('button', { name: 'Confirm', exact: true }).click()

        const copyInvite = tool.getByRole('button', {
            name: 'Copy Invite',
            exact: true,
        })
        await expect(copyInvite).toBeEnabled({ timeout: 60_000 })
        await copyInvite.click()
        return this.readClipboardWhen(text => text.startsWith('fedi:community'))
    }

    private async next(tool: Frame) {
        await tool.getByRole('button', { name: 'Next', exact: true }).click()
    }
}
