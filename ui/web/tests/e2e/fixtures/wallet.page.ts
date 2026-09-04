import { expect } from '@playwright/test'

import { BasePage } from './base.page'

const JOIN_TIMEOUT = 180_000
const CLAIM_TIMEOUT = 120_000

export class WalletPage extends BasePage {
    // The join screen takes the invite on the query string and previews it, so
    // a local fed that no discover list carries is still reachable.
    async joinByInvite(invite: string) {
        await this.goto(`/onboarding/join?id=${encodeURIComponent(invite)}`)
        const join = this.page.getByRole('button', {
            name: 'Join Wallet Service',
            exact: true,
        })
        await expect(join).toBeVisible({ timeout: JOIN_TIMEOUT })
        await join.click()
        await this.waitForUrl('**/wallet', JOIN_TIMEOUT)
    }

    // The ecash screen reads its token off the fragment rather than the query
    // string, so the token never reaches the server.
    async claimEcash(token: string) {
        await this.goto(`/ecash#id=${encodeURIComponent(token)}`)
        const claim = this.page.getByRole('button', {
            name: 'Claim Ecash',
            exact: true,
        })
        await expect(claim).toBeVisible({ timeout: CLAIM_TIMEOUT })
        await claim.click()
        await expect(this.page.getByText('Ecash claimed')).toBeVisible({
            timeout: CLAIM_TIMEOUT,
        })
        await this.page
            .getByRole('link', { name: 'Go to wallet', exact: true })
            .click()
        await this.waitForUrl('**/wallet', 60_000)
    }

    // The sats figure is the balance card's secondary line in bitcoin mode.
    async readSats(): Promise<number> {
        const raw = await this.page
            .getByTestId('WalletBalanceSats')
            .innerText({ timeout: 30_000 })
        const sats = parseInt(raw.replace(/[^0-9]/g, ''), 10)
        if (Number.isNaN(sats)) {
            throw new Error(`could not read a sats balance from "${raw}"`)
        }
        return sats
    }

    // The balance lands a beat after the claim screen, so poll rather than
    // reading once.
    async waitForSats(expected: number, timeout = 120_000) {
        await expect.poll(() => this.readSats(), { timeout }).toBe(expected)
    }

    // The dev fed mints with --allow-overpay, so a funding token is worth at
    // least what was asked for and often more.
    async waitForSatsAtLeast(floor: number, timeout = 120_000) {
        await expect
            .poll(() => this.readSats(), { timeout })
            .toBeGreaterThanOrEqual(floor)
    }

    // The history page reads its federation from the url hash, and only the
    // balance card knows which one to put there. Going straight to
    // /transactions renders an empty list.
    async openTransactions() {
        await this.page.getByTestId('BalanceCard__TransactionHistory').click()
        await this.waitForUrl(/\/transactions/, 30_000)
    }
}
