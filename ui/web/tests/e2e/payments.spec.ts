import { Page, expect, test } from '@playwright/test'

import {
    generateOnchainTestEcash,
    getOnchainTestFederation,
    ONCHAIN_TEST_ADDRESS,
} from '@fedi/common/tests/utils/onchainTestFederation'

import { devfedAvailable, getDevfedInvite } from './fixtures/devfed'
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

    await wallet.claimEcash(generateOnchainTestEcash(FUND_SATS))
    await wallet.waitForSatsAtLeast(FUND_SATS)

    // A history row carries the rail and the status. The "you received"
    // wording lives in the detail dialog behind it.
    await wallet.openTransactions()
    const entry = page.getByRole('button').filter({ hasText: /ecash/i }).first()
    await expect(entry).toBeVisible({ timeout: 60_000 })
    await expect(entry).toContainText('Complete')
})

test('blocks unaffordable on-chain payments and sends funded amounts', async ({
    page,
}, testInfo) => {
    test.setTimeout(360000)
    const { kind, minimum } = getOnchainTestFederation()
    const minimumMessage = `The minimum you can send is ${minimum.toLocaleString('en-US')} sats`
    const wallet = new WalletPage(page)
    const error = page.getByTestId('amount-input-error')
    const sats = page.getByTestId('AmountInputSats')
    const send = page.getByRole('button', { name: 'Send', exact: true })
    await new OnboardingPage(page).completeWithNewSeed()
    await wallet.joinByInvite(await getDevfedInvite())
    await wallet.waitForSats(0)

    await openAmount(page)
    await expect(error).toBeHidden()
    await send.click()
    await expect(error).toHaveText(minimumMessage)
    await expect(sats).toHaveText('0 sats')
    await enterAmount(page, 100000)
    await send.click()
    await expect(error).toHaveText(minimumMessage)
    await expect(sats).toBeVisible()
    await page.goto('/wallet')
    await wallet.waitForSats(0)

    await wallet.claimEcash(generateOnchainTestEcash(583))
    await expect.poll(() => wallet.readSats()).toBeGreaterThanOrEqual(581)
    const lowBalance = await wallet.readSats()
    expect(lowBalance).toBeLessThanOrEqual(583)
    await openAmount(page)
    for (const amount of [1, 583, 5836, 10000, 100000]) {
        await replaceAmount(page, amount)
        await expect(error).toHaveText(minimumMessage)
        await expect(error.getByRole('button')).toHaveCount(0)
        await error.locator('span').click()
        await expect(sats).toHaveText(`${amount.toLocaleString('en-US')} sats`)
        await send.click()
        await expect(error).toHaveText(minimumMessage)
        await expect(sats).toHaveText(`${amount.toLocaleString('en-US')} sats`)
    }
    await page.screenshot({
        path: testInfo.outputPath(`payments-onchain-${kind}-unaffordable.png`),
    })
    await page.getByRole('button').filter({ hasText: /USD$/ }).click()
    await expect(page.getByRole('button').filter({ has: sats })).toBeVisible()
    const fiatDigits = (await sats.innerText()).replace(/\D/g, '')
    for (let i = 0; i < fiatDigits.length + 3; i++) {
        await page.getByTestId('AmountInputBackspace').click()
    }
    await expect(sats).toHaveText('0 sats')
    await page.getByRole('button', { name: '1', exact: true }).click()
    const fiatInput = page.getByText('1 USD', { exact: true })
    await expect(fiatInput).toBeVisible()
    await expect(error).toHaveText(minimumMessage)
    await error.locator('span').click()
    await expect(fiatInput).toBeVisible()
    await send.click()
    await expect(error).toHaveText(minimumMessage)
    await expect(fiatInput).toBeVisible()
    await page.screenshot({
        path: testInfo.outputPath(`payments-onchain-${kind}-fiat.png`),
    })
    await page.goto('/wallet')
    await wallet.waitForSats(lowBalance)

    await openAmount(page, `bitcoin:${ONCHAIN_TEST_ADDRESS}?amount=0.001`)
    await expect(sats).toHaveText('100,000 sats')
    await expect(error).toHaveText(minimumMessage)
    await expect(error.getByRole('button')).toHaveCount(0)
    await error.locator('span').click()
    await expect(sats).toHaveText('100,000 sats')
    await expect(
        page.getByRole('button', { name: '1', exact: true }),
    ).toHaveCount(0)
    await send.click()
    await expect(error).toHaveText(minimumMessage)
    await page.goto('/wallet')
    await wallet.waitForSats(lowBalance)

    await wallet.claimEcash(generateOnchainTestEcash(100000, 'atLeast'))
    await expect.poll(() => wallet.readSats()).toBeGreaterThan(99000)
    const balanceBeforePayments = await wallet.readSats()
    await openAmount(page)
    await enterAmount(page, minimum - 1)
    await expect(error).toHaveText(minimumMessage)
    await error
        .getByRole('button', {
            name: `${minimum.toLocaleString('en-US')} sats`,
            exact: true,
        })
        .click()
    await expect(sats).toHaveText(`${minimum.toLocaleString('en-US')} sats`)
    await expect(error).toBeHidden()
    await send.click()
    await expect(
        page.getByText(`You sent ${minimum.toLocaleString('en-US')} sats`, {
            exact: true,
        }),
    ).toBeVisible({ timeout: 120000 })
    await page.goto('/wallet')
    const fundedBalance = await wallet.readSats()

    await openAmount(page)
    await enterAmount(page, fundedBalance + 100000)
    await expect(error).toContainText('The max you can send is ')
    const maxSuggestion = error.getByRole('button')
    let maximum = NaN
    let currentBalance = NaN
    await expect
        .poll(
            async () => {
                const match = (await maxSuggestion.textContent())?.match(
                    /^([\d,]+) sats$/i,
                )
                maximum = match ? Number(match[1].replace(/,/g, '')) : NaN
                const balanceText = await page
                    .getByRole('button')
                    .filter({ hasText: /SATS\)$/ })
                    .innerText()
                const balanceMatch = balanceText.match(/\(([\d,]+) SATS\)/)
                currentBalance = balanceMatch
                    ? Number(balanceMatch[1].replace(/,/g, ''))
                    : NaN
                return maximum >= minimum && maximum < currentBalance
            },
            { timeout: 30000, message: 'Expected a fee-adjusted maximum' },
        )
        .toBe(true)
    await expect(error).toContainText('The max you can send is ')
    await maxSuggestion.click()
    await expect(sats).toHaveText(`${maximum.toLocaleString('en-US')} sats`)
    await expect(error).toBeHidden()
    await send.click()
    await expect(
        page.getByText(`You sent ${maximum.toLocaleString('en-US')} sats`, {
            exact: true,
        }),
    ).toBeVisible({ timeout: 120000 })
    await page.screenshot({
        path: testInfo.outputPath(
            `payments-onchain-${kind}-funded-success.png`,
        ),
    })
    await page.goto('/wallet')
    await expect
        .poll(() => wallet.readSats())
        .toBeLessThanOrEqual(balanceBeforePayments - minimum - maximum)
})

async function openAmount(page: Page, destination = ONCHAIN_TEST_ADDRESS) {
    await page.goto('/send')
    await page.evaluate(
        value => navigator.clipboard.writeText(value),
        destination,
    )
    await page.getByRole('button', { name: 'Paste', exact: true }).click()
    await expect(page.getByTestId('AmountInputSats')).toBeVisible({
        timeout: 30000,
    })
    const switcher = page
        .getByRole('button')
        .filter({ has: page.getByTestId('AmountInputSats') })
    if (await switcher.count()) await switcher.click()
}

async function enterAmount(page: Page, amount: number) {
    for (const digit of String(amount)) {
        await page.getByRole('button', { name: digit, exact: true }).click()
    }
    await expect(page.getByTestId('AmountInputSats')).toHaveText(
        `${amount.toLocaleString('en-US')} sats`,
    )
}

async function replaceAmount(page: Page, amount: number) {
    const current = (
        await page.getByTestId('AmountInputSats').innerText()
    ).replace(/\D/g, '')
    for (let i = 0; i < current.length; i++) {
        await page.getByTestId('AmountInputBackspace').click()
    }
    await expect(page.getByTestId('AmountInputSats')).toHaveText('0 sats')
    await enterAmount(page, amount)
}
