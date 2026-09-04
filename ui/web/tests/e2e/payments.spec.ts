import { test, expect } from '@playwright/test'

import {
    devfedAvailable,
    generateDevfedEcash,
    getDevfedInvite,
} from './fixtures/devfed'
import { OnboardingPage } from './fixtures/onboarding.page'
import { WalletPage } from './fixtures/wallet.page'

// Payments on web run against the same local devimint federation the native
// suite funds from.

const FUND_SATS = 5000

// On CI this fails rather than skipping. A payment suite that quietly skips
// itself reports exactly like one that passed.
test.beforeEach(() => {
    if (devfedAvailable()) return
    if (process.env.CI) {
        throw new Error(
            'REMOTE_BRIDGE_PORT is unset on CI; the web e2e job has to run with --with-devfed',
        )
    }
    test.skip(
        true,
        'needs the local dev fed (scripts/ui/run-e2e-web.sh --with-devfed)',
    )
})

test('joins a local federation and claims ecash into the balance', async ({
    page,
}) => {
    const onboarding = new OnboardingPage(page)
    const wallet = new WalletPage(page)

    await onboarding.completeWithNewSeed()
    await wallet.joinByInvite(await getDevfedInvite())
    await wallet.waitForSats(0)

    await wallet.claimEcash(await generateDevfedEcash(FUND_SATS * 1000))
    await wallet.waitForSatsAtLeast(FUND_SATS)

    // A history row carries the rail and the status. The "you received"
    // wording lives in the detail dialog behind it.
    await wallet.openTransactions()
    const entry = page.getByRole('button').filter({ hasText: /ecash/i }).first()
    await expect(entry).toBeVisible({ timeout: 60_000 })
    await expect(entry).toContainText('Complete')
})
