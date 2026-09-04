import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import {
    acceptCameraPermissionIfPresent,
    allowPasteIfPrompted,
} from '../fixtures/setupOnboardedLocalFed'

// Tapping WalletTabButton while already on the wallet tab opens the wallet
// switcher overlay instead of navigating, so only tap it when the wallet
// action buttons aren't already on screen. Clear the backup reminder first: it
// hides Receive, which would otherwise read here as "not on the wallet yet".
export async function goToWallet(t: AppiumTestBase): Promise<void> {
    await dismissBackupReminderIfPresent(t, 1000)
    if (await t.isTextPresent('Receive', true, 3000)) return
    await t.clickElementByKey('WalletTabButton')
    await waitForWalletReceive(t)
}

export async function dismissBackupReminderIfPresent(
    t: AppiumTestBase,
    timeout = 1500,
): Promise<void> {
    if (await t.elementIsDisplayed('BackupReminderDismissButton', timeout)) {
        await t.clickElementByKey('BackupReminderDismissButton')
    }
}

// Wait until the wallet's Receive button is on screen. The backup reminder
// overlay (new-seed account over ~210 sats, not backed up) pops up a beat after
// we land on the wallet, later on the slower android emulator, and hides
// Receive. A one-shot dismiss races that delay and misses it, so poll: re-check
// Receive and dismiss the overlay whenever it shows, until Receive wins. "Not
// now" sets dismissedThisSession, so once dismissed it stays gone for the run.
export async function waitForWalletReceive(
    t: AppiumTestBase,
    timeout = 30000,
): Promise<void> {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        if (await t.isTextPresent('Receive', true, 2000)) return
        await dismissBackupReminderIfPresent(t, 1000)
    }
    // Final assert so a genuine miss fails with the usual message.
    await t.waitForText('Receive', 0, true, 5000)
}

// The sats balance is a value, not a label, so it carries a testID. Caller
// must already be on the wallet screen.
export async function readWalletSats(t: AppiumTestBase): Promise<number> {
    const raw = await t.getTextByKey('WalletBalanceSats')
    const sats = parseInt(raw.replace(/[^0-9]/g, ''), 10)
    if (Number.isNaN(sats)) {
        throw new Error(`could not read sats balance, got "${raw}"`)
    }
    return sats
}

// The first successful payment on a federation raises a rate-federation
// overlay that intercepts navigation, so every success screen has to clear it
// before the wallet is reachable.
export async function dismissRateFederationIfPresent(
    t: AppiumTestBase,
): Promise<void> {
    if (await t.elementIsDisplayed('RateFederationCloseButton', 4000)) {
        await t.clickElementByKey('RateFederationCloseButton')
    }
}

export async function dismissSendSuccess(t: AppiumTestBase): Promise<void> {
    await t.clickOnText('Done', 0, true)
    await dismissRateFederationIfPresent(t)
    await waitForWalletReceive(t)
}

export async function dismissReceiveSuccess(t: AppiumTestBase): Promise<void> {
    await t.clickOnText('Done', 0, true)
    // Receiving past the reminder threshold raises the backup reminder overlay
    // once we land back on the wallet, so clear it before asserting Receive.
    await waitForWalletReceive(t)
}

// The amount keypad defaults to fiat (amountInputType is unset on a fresh
// install), so flip to sats before typing a sats amount.
export async function ensureSatsMode(t: AppiumTestBase): Promise<void> {
    await t.waitForElementDisplayed('AmountInputLabel')
    const isSats = async () =>
        (await t.getTextByKey('AmountInputLabel'))
            .toUpperCase()
            .includes('SATS')
    // Re-read after the final toggle too: a tap can take longer than the
    // settle delay to land, and checking only before each tap would throw on
    // a toggle that actually worked.
    for (let i = 0; i < 3; i++) {
        if (await isSats()) return
        await t.clickElementByKey('AmountUnitSwitcher')
        await new Promise(r => setTimeout(r, 400))
    }
    if (await isSats()) return
    throw new Error('could not switch amount input to SATS mode')
}

export async function enterAmount(
    t: AppiumTestBase,
    sats: number,
): Promise<void> {
    for (const digit of String(sats)) {
        await t.clickElementByKey(`NumpadButton-${digit}`)
    }
    // A dropped numpad tap would otherwise surface much later as a wrong
    // payment amount, so verify what actually landed in the input.
    const entered = (await t.getTextByKey('AmountInputValue')).replace(
        /[^0-9]/g,
        '',
    )
    if (entered !== String(sats)) {
        throw new Error(`amount input shows "${entered}" after typing ${sats}`)
    }
}

export async function generateLightningInvoice(
    t: AppiumTestBase,
    sats: number,
): Promise<string> {
    await goToWallet(t)
    await t.clickOnText('Receive', 0, true)
    await t.waitForElementDisplayed('ReceiveRequestButton')
    await ensureSatsMode(t)
    await enterAmount(t, sats)
    await t.clickElementByKey('ReceiveRequestButton')
    await t.waitForText('Copy', 0, true, 30000)
    await t.clickOnText('Copy', 0, true)
    const invoice = (await t.getClipboard()).trim()
    if (!/^ln/i.test(invoice)) {
        throw new Error(
            `clipboard is not a lightning invoice: "${invoice.slice(0, 40)}"`,
        )
    }
    return invoice
}

export async function generateOnchainReceiveAddress(
    t: AppiumTestBase,
): Promise<string> {
    await goToWallet(t)
    await t.clickOnText('Receive', 0, true)
    await t.waitForElementDisplayed('ReceiveRequestButton')
    await t.clickElementByKey('bitcoinTab')
    await t.waitForText('Copy', 0, true, 30000)
    await t.setClipboard('')

    for (let attempt = 1; attempt <= 10; attempt++) {
        await t.clickOnText('Copy', 0, true)
        const address = (await t.getClipboard()).trim()
        if (isBitcoinAddress(address)) {
            await t.clickElementByKey('HeaderBackButton')
            await waitForWalletReceive(t)
            return address
        }
        await new Promise(r => setTimeout(r, 1000))
    }

    const clipboard = (await t.getClipboard()).trim()
    throw new Error(
        `clipboard did not contain a bitcoin address after on-chain receive copy: "${clipboard.slice(
            0,
            40,
        )}"`,
    )
}

export function isBitcoinAddress(value: string): boolean {
    return /^(bc1|tb1|bcrt1)[a-z0-9]{20,}$|^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,}$/.test(
        value,
    )
}

export async function payLightningInvoiceByDeepLink(
    t: AppiumTestBase,
    invoice: string,
): Promise<void> {
    await goToWallet(t)
    await t.openDeepLink(`lightning:${invoice}`)
    await t.waitForText(
        'This is a lightning payment request, do you want to pay it?',
        0,
        true,
        30000,
    )
    await t.clickOnText('Continue', 0, true)
    await t.waitForElementDisplayed('SendConfirmButton', 30000)
    await t.clickElementByKey('SendConfirmButton')
}

export async function sendEcash(
    t: AppiumTestBase,
    sats: number,
): Promise<string> {
    await goToWallet(t)
    await t.clickOnText('Send', 0, true)
    await t.clickElementByKey('ecashTab')
    await ensureSatsMode(t)
    await enterAmount(t, sats)
    await t.clickOnText('Next', 0, true)
    await t.waitForElementDisplayed('SendConfirmButton', 30000)
    await assertEcashFeeDetailsVisible(t)
    await t.clickElementByKey('SendConfirmButton')
    // Offline-send warning is a native Alert.alert dialog.
    await t.acceptAlert('Continue')
    await t.waitForText('Copy', 0, true, 30000)
    await t.clickOnText('Copy', 0, true)
    const ecash = (await t.getClipboard()).trim()
    if (!ecash) throw new Error('clipboard empty after copying ecash token')
    return ecash
}

export async function assertEcashFeeDetailsVisible(
    t: AppiumTestBase,
): Promise<void> {
    // The fee row is collapsed behind a "Show details" toggle.
    await t.clickOnText('Show details', 0, true)
    if (!(await t.elementIsDisplayed('fee-info-button', 5000))) {
        throw new Error('ecash send is missing the fee details row')
    }
    await t.clickElementByKey('fee-info-button')
    for (const line of ['Fee details', 'Fedi fee', 'Federation fee']) {
        if (!(await t.isTextPresent(line, true, 5000))) {
            throw new Error(`ecash fee breakdown is missing "${line}"`)
        }
    }
    await t.clickElementByKey('fee-breakdown-close')
}

// The cancel control has no testID, and its label is unique on that screen.
export async function cancelEcashSend(t: AppiumTestBase): Promise<void> {
    await t.clickOnText('Cancel Send', 0, true)
    await t.acceptAlert('Continue')
}

export async function redeemEcash(
    t: AppiumTestBase,
    token: string,
): Promise<void> {
    await t.clickElementByKey('ScanTabButton')
    await acceptCameraPermissionIfPresent(t)
    await t.setClipboard(token)
    await t.clickElementByKey('PasteButton')
    await allowPasteIfPrompted(t)
    await t.clickOnText('Continue', 0, true)
    await t.waitForElementDisplayed('claim-ecash-button', 30000)
    await t.clickElementByKey('claim-ecash-button')
}

export type WalletMode = 'bitcoin' | 'stable-balance'

// The switcher builds each tab's testID from the option value.
export async function switchWalletTo(
    t: AppiumTestBase,
    mode: WalletMode,
): Promise<void> {
    await goToWallet(t)
    await t.clickElementByKey(`${mode}Tab`)
}

// The balance card's headline figure: the stable total in stable mode, the
// fiat value of the sats in bitcoin mode.
export async function readWalletPrimary(t: AppiumTestBase): Promise<number> {
    const raw = await t.getTextByKey('WalletBalancePrimary')
    const value = parseFloat(raw.replace(/[^0-9.]/g, ''))
    if (Number.isNaN(value)) {
        throw new Error(`could not read the balance headline, got "${raw}"`)
    }
    return value
}

// The stability screens lock the input to fiat and hide the unit switcher, so
// there is no sats mode to flip into. Digits are whole units, so three taps of
// 1 is 111 dollars.
export async function enterFiatAmount(
    t: AppiumTestBase,
    dollars: number,
): Promise<void> {
    await t.waitForElementDisplayed('AmountInputLabel')
    for (const digit of String(dollars)) {
        await t.clickElementByKey(`NumpadButton-${digit}`)
    }
    const entered = parseFloat(
        (await t.getTextByKey('AmountInputValue')).replace(/[^0-9.]/g, ''),
    )
    if (entered !== dollars) {
        throw new Error(
            `fiat input shows "${entered}" after typing ${dollars} dollars`,
        )
    }
}

export async function depositToStableBalance(
    t: AppiumTestBase,
    dollars: number,
): Promise<void> {
    await switchWalletTo(t, 'stable-balance')
    await t.clickOnText('Receive', 0, true)
    await enterFiatAmount(t, dollars)
    await t.clickOnText('Next', 0, true)
    // The confirmation keeps its sats and dollar figures behind a details
    // toggle, so the Deposit action is the only thing reliably on screen.
    await t.clickOnText('Deposit', 0, true, 30000)
    await t.waitForText('Deposited!', 0, true, 120000)
    // The stability success screen acknowledges with OK, unlike the send one.
    await t.clickOnText('OK', 0, true)
    await dismissRateFederationIfPresent(t)
    await waitForWalletReceive(t)
}

export async function withdrawFromStableBalance(
    t: AppiumTestBase,
    dollars: number,
): Promise<void> {
    await switchWalletTo(t, 'stable-balance')
    await t.clickOnText('Send', 0, true)
    await enterFiatAmount(t, dollars)
    await t.clickOnText('Send', 0, true)
    await t.waitForText('Withdraw', 0, true, 30000)
    await t.clickOnText('Withdraw', 0, true)
    await t.clickOnText('Okay', 0, true)
    await dismissRateFederationIfPresent(t)
    await waitForWalletReceive(t)
}

// Assert against the detail overlay's secondary amount: with the default
// fiat display it renders the raw sats ("2,000 SATS"), while the primary
// amount and the list rows go through the exchange rate and aren't
// deterministic. The status is a list because an on-chain send may still
// be "Pending" when checked.
export async function assertNewestTransaction(
    t: AppiumTestBase,
    expected: {
        title: string
        // Omit for a stability entry. That detail overlay is built without a
        // type field, unlike the wallet one.
        type?: string
        statuses: string[]
        // Omit when the amount is not known up front, as with a stable
        // balance deposit entered in fiat at the live rate.
        sats?: number
    },
): Promise<void> {
    await goToWallet(t)
    await t.clickElementByKey('BalanceCard__TransactionHistory')
    await t.waitForElementDisplayed('transaction-item', 30000)

    // The list renders cached rows while its refresh is in flight, so the
    // first row can still be the previous entry; re-open it until the
    // title matches instead of failing on a stale row. A genuinely wrong
    // newest entry still fails: retries never change what the row is.
    let titleSeen = false
    for (let attempt = 1; attempt <= 3 && !titleSeen; attempt++) {
        await t.clickElementByKey('transaction-item')
        titleSeen = await t.isTextPresent(expected.title, true, 5000)
        if (!titleSeen) {
            await t.clickElementByKey('HistoryDetailCloseButton')
            await new Promise(r => setTimeout(r, 2000))
        }
    }
    if (!titleSeen) {
        const seen = await t.getTextByKey('HistoryDetailSecondaryAmount')
        throw new Error(
            `newest transaction never showed "${expected.title}"; the entry on screen reads ${seen}`,
        )
    }

    if (
        expected.type !== undefined &&
        !(await t.isTextPresent(expected.type, true, 5000))
    ) {
        throw new Error(
            `newest transaction is not typed "${expected.type}" after ${expected.title}`,
        )
    }

    // Send entries carry their fee inside txn.amount (a 2,000 sats
    // lightning send renders as "2,004 SATS" on the dev fed), so bound the
    // amount instead of matching it exactly; receives are exact and pass
    // the bound trivially. Read the amount by key: a text search for
    // " SATS" matches the whole overlay on ios, where the accessibility
    // tree concatenates child labels.
    if (expected.sats !== undefined) {
        const satsText = (
            await t.getTextByKey('HistoryDetailSecondaryAmount')
        ).trim()
        const shownSats = parseInt(satsText.replace(/[^0-9]/g, ''), 10)
        const feeAllowance = Math.max(10, Math.ceil(expected.sats * 0.01))
        if (
            Number.isNaN(shownSats) ||
            shownSats < expected.sats ||
            shownSats > expected.sats + feeAllowance
        ) {
            throw new Error(
                `newest transaction shows "${satsText}", expected ${expected.sats} sats plus at most ${feeAllowance} in fees`,
            )
        }
    }

    let statusSeen = false
    for (const status of expected.statuses) {
        if (await t.isTextPresent(status, true, 2000)) {
            statusSeen = true
            break
        }
    }
    if (!statusSeen) {
        throw new Error(
            `newest transaction status is not one of ${expected.statuses.join(', ')}`,
        )
    }

    await t.clickElementByKey('HistoryDetailCloseButton')
    await t.clickElementByKey('HeaderBackButton')
    await waitForWalletReceive(t)
}

export async function assertNewestTransactionNotesCanBeEdited(
    t: AppiumTestBase,
    note: string,
): Promise<void> {
    await goToWallet(t)
    await t.clickElementByKey('BalanceCard__TransactionHistory')
    await t.waitForElementDisplayed('transaction-item', 30000)
    await t.clickElementByKey('transaction-item')
    await t.waitForElementDisplayed('NotesInputButton', 30000)
    await t.clickElementByKey('NotesInputButton')
    await t.waitForElementDisplayed('EditNotesInput', 10000)
    await t.typeIntoElementByKey('EditNotesInput', note)
    await t.dismissKeyboard()
    await t.clickOnText('Save', 0, true)
    await t.waitForText(note, 0, true, 10000)
    await t.clickElementByKey('HistoryDetailCloseButton')
    await t.waitForText(note, 0, false, 30000)
    await t.clickElementByKey('transaction-item')
    await t.waitForText(note, 0, true, 10000)
    await t.clickElementByKey('HistoryDetailCloseButton')
    await t.clickElementByKey('HeaderBackButton')
    await waitForWalletReceive(t)
}

export async function cancelNewestEcashSendFromHistory(
    t: AppiumTestBase,
    sats: number,
): Promise<void> {
    // sendEcash leaves the device on the animated QR screen; closing it is the
    // only way to exercise the separate HistoryDetail cancellation path.
    await t.clickElementByKey('HeaderCloseButton')
    await goToWallet(t)
    await t.clickElementByKey('BalanceCard__TransactionHistory')
    await t.waitForElementDisplayed('transaction-item', 30000)
    await t.clickElementByKey('transaction-item')

    for (const line of ['You sent', 'ecash', 'Sent']) {
        if (!(await t.isTextPresent(line, true, 5000))) {
            throw new Error(`uncanceled ecash history detail missing "${line}"`)
        }
    }

    const satsText = (
        await t.getTextByKey('HistoryDetailSecondaryAmount')
    ).trim()
    const shownSats = parseInt(satsText.replace(/[^0-9]/g, ''), 10)
    // At-least note selection can overspend by a sat or two, so allow the
    // same fee margin as assertNewestTransaction.
    const feeAllowance = Math.max(10, Math.ceil(sats * 0.01))
    if (
        Number.isNaN(shownSats) ||
        shownSats < sats ||
        shownSats > sats + feeAllowance
    ) {
        throw new Error(
            `uncanceled ecash history detail shows "${satsText}", expected ${sats} sats plus at most ${feeAllowance} in fees`,
        )
    }

    await t.clickElementByKey('HistoryDetailCancelEcashButton')
    await t.acceptAlert('Continue')
    // The list row folds its texts into one accessibility label, so only a
    // substring match sees the new entry from the list.
    await t.waitForText('Canceled Ecash Send', 0, false, 60000)

    let canceledStateSeen = false
    for (let attempt = 1; attempt <= 5 && !canceledStateSeen; attempt++) {
        await t.clickElementByKey('transaction-item')
        const canceledTitleSeen =
            (await t.isTextPresent('Canceled Ecash Send', true, 3000)) ||
            (await t.isTextPresent('You sent', true, 3000))
        const canceledStatusSeen = await t.isTextPresent('Canceled', true, 3000)
        canceledStateSeen = canceledTitleSeen && canceledStatusSeen
        if (!canceledStateSeen) {
            await t.clickElementByKey('HistoryDetailCloseButton')
            await new Promise(r => setTimeout(r, 2000))
        }
    }
    if (!canceledStateSeen) {
        throw new Error('ecash cancel result did not show a canceled state')
    }

    await t.clickElementByKey('HistoryDetailCloseButton')
    await t.clickElementByKey('HeaderBackButton')
    await waitForWalletReceive(t)
}

export async function assertBackupReminderAction(
    t: AppiumTestBase,
): Promise<void> {
    await t.waitForText(
        'Backup your account to protect your money and data.',
        0,
        true,
        30000,
    )
    await t.clickOnText('Backup Now', 0, true)
    await t.waitForElementDisplayed('SeedWord1', 30000)
    await t.clickElementByKey('HeaderBackButton')
}
