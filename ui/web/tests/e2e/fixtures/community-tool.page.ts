import { Frame, expect } from '@playwright/test'

import { BasePage } from './base.page'

// Drives the community creation tool, which the app loads as a cross-origin
// iframe (community-tool-two.vercel.app) inside its in-app browser. Playwright
// reaches the embedded DOM directly via page.frames(). Driving a third-party
// site is normally avoided; it is intentional here, the in-app browser is the
// surface under test and backs every mini app.
export class CommunityToolPage extends BasePage {
    // Publishes a minimal community (name + welcome message, plus any of the
    // user's chats given by name) and returns its invite code, read from the
    // clipboard via the tool's "Copy Invite".
    // Call on the post-onboarding wallet; grant clipboard-read/write first.
    async createSpace(name: string, chatNames: string[] = []): Promise<string> {
        // Navigate directly: the Spaces nav link only exists on screens with
        // the tab bar, and callers may start from one without it (e.g. a chat
        // conversation).
        await this.goto('/home')
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

        // Skip the optional Mini Apps step.
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
        if (chatNames.length > 0) await this.addGroupChats(tool, chatNames)
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

    // On the wizard's Group Chat step, attach existing chats. The tool's
    // "Add Group Chat" button hands off to the app's chat picker dialog
    // (rendered in the outer page, not the iframe); confirming there sends
    // the room ids back into the tool, which lists them by name.
    private async addGroupChats(tool: Frame, chatNames: string[]) {
        await tool
            .getByRole('button', { name: 'Add Group Chat', exact: true })
            .click()

        const dialog = this.page.getByRole('dialog')
        await expect(dialog.getByText('Add Chat Room')).toBeVisible({
            timeout: 30_000,
        })
        for (const name of chatNames) {
            await dialog.getByText(name, { exact: true }).click()
        }
        await dialog
            .getByRole('button', { name: 'Continue', exact: true })
            .click()

        // The picker hands every selected id to the tool in one batch, so one
        // materialized row proves the round-trip; the joiner's home tiles
        // assert each chat downstream. Don't check the other rows' names
        // here: the web injection responses carry no request id, so the
        // tool's concurrent name lookups can cross-wire and every row may
        // display the first response's name.
        await expect(
            tool.getByText(chatNames[0], { exact: true }).first(),
        ).toBeVisible({ timeout: 30_000 })
    }
}
