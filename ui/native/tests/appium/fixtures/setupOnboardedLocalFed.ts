/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'

// Onboards a fresh actor and joins a federation by a runtime-known invite code.
// After "Get started" -> "No" the app lands on the wallet-setup screen
// (Auto-Select / Manual). A local devimint fed is not in the public discover
// list, so take Manual -> Join tab and paste the runtime invite.
export async function setupOnboardedLocalFed(
    t: AppiumTestBase,
    invite: string,
): Promise<void> {
    console.log('Fixture: setupOnboardedLocalFed')
    await t.clickElementByKey('Get started')
    await t.clickElementByKey('No')
    // Seed creation after "No" is async and can be slow under the devfed's CPU
    // load, so wait generously for the wallet-setup screen to render.
    await t.waitForElementDisplayed('ManualSetupButton', 90000)
    await t.clickElementByKey('ManualSetupButton')
    await t.clickElementByKey('joinTab')
    await acceptCameraPermissionIfPresent(t)
    await t.setClipboard(invite)
    await t.clickElementByKey('PasteButton')
    await allowPasteIfPrompted(t)
    await t.clickOnText('Continue', 0, true)
    await t.waitForElementDisplayed('JoinFederationButton', 45000)
    await t.clickElementByKey('JoinFederationButton')
    await t.clickElementByKey('HomeTabButton')
}

// iOS pops a system paste-permission alert ("Fedi would like to paste from
// CoreSimulatorBridge") every time the app reads an Appium-set pasteboard, and
// the pasted content is only delivered once it is allowed. Poll briefly: the
// alert can lag the PasteButton tap under load.
export async function allowPasteIfPrompted(t: AppiumTestBase): Promise<void> {
    if (currentPlatform !== Platform.IOS) return
    for (let i = 0; i < 16; i++) {
        try {
            const buttons = (await t.driver.executeScript('mobile: alert', [
                { action: 'getButtons' },
            ])) as string[] | null
            if (buttons && buttons.length > 0) {
                await t.driver.executeScript('mobile: alert', [
                    { action: 'accept', buttonLabel: 'Allow Paste' },
                ])
                return
            }
        } catch {
            /* no alert on screen yet */
        }
        await new Promise(r => setTimeout(r, 500))
    }
    // The alert normally lands within a second. If it never did, the paste was
    // not delivered and the next step acts on an empty input, so surface it
    // here rather than letting it read as a downstream element-not-found.
    console.warn(
        'iOS paste-permission alert never appeared; paste may be empty',
    )
}

// The omni scanner requests camera permission on mount; the OS dialog can sit
// over the paste button. Best-effort accept; ignore if no dialog is present.
// Android sessions run with autoGrantPermissions, so the dialog never exists
// there and each acceptAlert attempt would just burn its full retry budget.
export async function acceptCameraPermissionIfPresent(
    t: AppiumTestBase,
): Promise<void> {
    if (currentPlatform === Platform.ANDROID) return
    for (const label of ['While using the app', 'Allow', 'OK']) {
        try {
            await t.acceptAlert(label)
            return
        } catch {
            /* no dialog for this label; try the next */
        }
    }
}
