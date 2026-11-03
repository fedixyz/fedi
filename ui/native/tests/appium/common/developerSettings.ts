import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

const DEVELOPER_MODE_TAPS = 23

// Call from a main tab. Tapping the tab that is already open can open its switcher
// sheet over the avatar.
export async function openDeveloperSettings(t: AppiumTestBase): Promise<void> {
    await t.clickElementByKey('AvatarButton')
    await t.waitForElementDisplayed('UserQrContainer')
    await t.scrollToElement('AppVersionButton')
    for (let tap = 0; tap < DEVELOPER_MODE_TAPS; tap++) {
        await t.clickElementByKey('AppVersionButton')
    }
    // Every tap from the 23rd toggles developer mode, so a dropped tap
    // leaves it off. The menu entry is the state to check, not the toast.
    for (let attempt = 0; ; attempt++) {
        const entry = await t.scrollToElement('DeveloperSettingsButton', {
            scrollDirection: 'up',
            maxScrolls: 20,
        })
        if (entry) break
        if (attempt === 2) throw new Error('developer mode did not unlock')
        await t.scrollToElement('AppVersionButton')
        await t.clickElementByKey('AppVersionButton')
    }
    // the 10% search swipe can leave the first row mostly under the header,
    // where the tap hits the developer mode toast
    await t.scroll('up', 1000, 50)
    await t.clickElementByKey('DeveloperSettingsButton')
}
