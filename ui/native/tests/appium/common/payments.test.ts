/* eslint-disable no-console */
import { execFileSync } from 'child_process'

import AppiumManager from '../../configs/appium/AppiumManager'
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'
import {
    acceptCameraPermissionIfPresent,
    allowPasteIfPrompted,
    setupOnboardedLocalFed,
} from '../fixtures/setupOnboardedLocalFed'

// Funding is hermetic: a devimint regtest lightning federation runs on the host
// (launched by scripts/bridge/run-remote.sh --with-devfed wrapping the runner).
// The invite and minted ecash come from the remote-server HTTP endpoints on the
// host loopback via REMOTE_BRIDGE_PORT. The fed binds to the host loopback,
// which an android emulator cannot see, so the test forwards its ports in with
// adb reverse (reverseDevfedPortsIntoDevices). ios simulators reach the host
// loopback directly and need no forwarding.

const FUND_SATS = 10000
const LN_P2P_SATS = 2000
const ECASH_SATS = 1000

export class Payments extends AppiumTestBase {
    // No registry prerequisites: a local fed's invite is only known at
    // runtime, so execute() onboards and joins both actors itself.
    static prerequisites = [] as const
    // 'walletUsed' has no fixture; declaring it makes the runner reset to a
    // fresh account after this test so a later test never inherits a funded
    // wallet (or this test's runtime federation).
    static produces = ['onboarded', 'walletUsed'] as const
    static actors = 2

    async execute(): Promise<void> {
        console.log('Starting Payments test')

        // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
        const alice: AppiumTestBase = this
        const bob = await this.spawnActor('b')

        // Phase 0: both actors onboard and join the same local federation.
        console.log('[phase0] join local fed')
        await reverseDevfedPortsIntoDevices()
        const invite = await getDevfedInvite()
        await setupOnboardedLocalFed(alice, invite)
        await setupOnboardedLocalFed(bob, invite)

        // Phase 1: fund alice with ecash minted from the dev-fed.
        console.log('[phase1] fund alice with dev-fed ecash')
        const fundEcash = await generateDevfedEcash(FUND_SATS * 1000)
        await redeemEcash(alice, fundEcash)
        await alice.waitForText('Ecash claimed', 0, true, 120000)
        await alice.clickOnText('Go to wallet', 0, true)
        await alice.waitForText('Receive', 0, true, 30000)
        const aliceFunded = await readWalletSats(alice)
        if (aliceFunded !== FUND_SATS) {
            throw new Error(
                `alice has ${aliceFunded} sats after funding, expected ${FUND_SATS}`,
            )
        }
        console.log('[phase1] alice funded')

        // Phase 2: alice -> bob over lightning (send + receive across devices).
        console.log('[phase2] alice -> bob lightning')
        const bobInvoice = await generateLightningInvoice(bob, LN_P2P_SATS)
        await payLightningInvoice(alice, bobInvoice)
        await alice.waitForText('You sent', 0, true, 60000)
        await bob.waitForText('You received', 0, true, 120000)
        await dismissSendSuccess(alice)
        await dismissReceiveSuccess(bob)
        console.log('[phase2] lightning transfer confirmed on both devices')

        // Phase 3: bob -> alice over ecash (offline send + claim).
        console.log('[phase3] bob -> alice ecash')
        const ecashToken = await sendEcash(bob, ECASH_SATS)
        await redeemEcash(alice, ecashToken)
        await alice.waitForText('Ecash claimed', 0, true, 60000)
        await alice.clickOnText('Go to wallet', 0, true)
        await alice.waitForText('Receive', 0, true, 30000)
        // Sent 2000 over lightning, received 1000 back as ecash, so alice's
        // balance must have moved below what she was funded with.
        const aliceFinal = await readWalletSats(alice)
        if (aliceFinal >= aliceFunded) {
            throw new Error(
                `alice balance ${aliceFinal} should be below the funded ${aliceFunded} after the transfers`,
            )
        }
        console.log('[phase3] ecash transfer confirmed')
    }
}

// The dev-fed's remote-server exposes invite + ecash over HTTP on the host
// loopback; the runner (a host node process) reads REMOTE_BRIDGE_PORT from env.
function devfedBaseUrl(): string {
    const port = process.env.REMOTE_BRIDGE_PORT
    if (!port) {
        throw new Error(
            'REMOTE_BRIDGE_PORT is unset; run under scripts/bridge/run-remote.sh --with-devfed',
        )
    }
    return `http://127.0.0.1:${port}`
}

// The fed binds every service to the host's loopback, which an android
// emulator cannot see (its 127.0.0.1 is the emulator itself). Map each fed
// port into the emulators with adb reverse so the app can dial the invite's
// addresses unmodified. iOS simulators share the host loopback and need
// nothing.
async function reverseDevfedPortsIntoDevices(): Promise<void> {
    if (currentPlatform !== Platform.ANDROID) return
    const res = await fetch(`${devfedBaseUrl()}/ports`)
    const body = await res.text()
    if (!res.ok) throw new Error(`ports ${res.status}: ${body}`)
    const ports: number[] = JSON.parse(body).ports
    if (!ports?.length) throw new Error(`ports response had no ports: ${body}`)
    for (const handle of AppiumManager.activeHandles()) {
        const udid = AppiumManager.deviceId(handle)
        if (!udid) continue
        for (const port of ports) {
            execFileSync('adb', [
                '-s',
                udid,
                'reverse',
                `tcp:${port}`,
                `tcp:${port}`,
            ])
        }
        console.log(`[phase0] reversed ${ports.length} fed ports into ${udid}`)
    }
}

async function getDevfedInvite(): Promise<string> {
    const res = await fetch(`${devfedBaseUrl()}/invite_code`)
    const body = await res.text()
    if (!res.ok) throw new Error(`invite_code ${res.status}: ${body}`)
    const invite = JSON.parse(body).invite_code
    if (!invite) throw new Error(`invite_code response had no invite: ${body}`)
    return invite
}

async function generateDevfedEcash(msats: number): Promise<string> {
    const res = await fetch(`${devfedBaseUrl()}/generate_ecash/${msats}`)
    const body = await res.text()
    if (!res.ok) throw new Error(`generate_ecash ${res.status}: ${body}`)
    const ecash = JSON.parse(body).ecash
    if (!ecash) throw new Error(`generate_ecash response had no ecash: ${body}`)
    return ecash
}

// Tapping WalletTabButton while already on the wallet tab opens the wallet
// switcher overlay instead of navigating, so only tap it when the wallet
// action buttons aren't already on screen.
async function goToWallet(t: AppiumTestBase): Promise<void> {
    if (await t.isTextPresent('Receive', true, 3000)) return
    await t.clickElementByKey('WalletTabButton')
    await t.waitForText('Receive', 0, true)
}

// The sats balance is a value, not a label, so it carries a testID. Caller
// must already be on the wallet screen.
async function readWalletSats(t: AppiumTestBase): Promise<number> {
    const raw = await t.getTextByKey('WalletBalanceSats')
    const sats = parseInt(raw.replace(/[^0-9]/g, ''), 10)
    if (Number.isNaN(sats)) {
        throw new Error(`could not read sats balance, got "${raw}"`)
    }
    return sats
}

async function generateLightningInvoice(
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

async function payLightningInvoice(
    t: AppiumTestBase,
    invoice: string,
): Promise<void> {
    await goToWallet(t)
    await t.clickOnText('Send', 0, true)
    // Send opens on the lightning tab with the omni input (scan + paste).
    await acceptCameraPermissionIfPresent(t)
    await t.setClipboard(invoice)
    await t.clickElementByKey('PasteButton')
    await allowPasteIfPrompted(t)
    await t.waitForElementDisplayed('SendConfirmButton', 30000)
    await t.clickElementByKey('SendConfirmButton')
}

async function sendEcash(t: AppiumTestBase, sats: number): Promise<string> {
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

async function assertEcashFeeDetailsVisible(t: AppiumTestBase): Promise<void> {
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

async function redeemEcash(t: AppiumTestBase, token: string): Promise<void> {
    await t.clickElementByKey('ScanTabButton')
    await acceptCameraPermissionIfPresent(t)
    await t.setClipboard(token)
    await t.clickElementByKey('PasteButton')
    await allowPasteIfPrompted(t)
    await t.clickOnText('Continue', 0, true)
    await t.waitForElementDisplayed('claim-ecash-button', 30000)
    await t.clickElementByKey('claim-ecash-button')
}

async function dismissReceiveSuccess(t: AppiumTestBase): Promise<void> {
    await t.clickOnText('Done', 0, true)
    await t.waitForText('Receive', 0, true, 30000)
}

async function dismissSendSuccess(t: AppiumTestBase): Promise<void> {
    await t.clickOnText('Done', 0, true)
    // The first successful send can raise a rate-federation overlay that
    // intercepts navigation; close it if present so we land on the wallet.
    if (await t.elementIsDisplayed('RateFederationCloseButton', 4000)) {
        await t.clickElementByKey('RateFederationCloseButton')
    }
    await t.waitForText('Receive', 0, true, 30000)
}

// The amount keypad defaults to fiat (amountInputType is unset on a fresh
// install), so flip to sats before typing a sats amount.
async function ensureSatsMode(t: AppiumTestBase): Promise<void> {
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

async function enterAmount(t: AppiumTestBase, sats: number): Promise<void> {
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
