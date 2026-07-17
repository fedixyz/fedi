/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

// Publishes a Space (community) whose default chats are the named groups, and
// returns its invite code. Mirrors the web e2e's CommunityToolPage.createSpace
// (ui/web/tests/e2e/fixtures/community-tool.page.ts), expressed through
// Appium: the creation tool is a cross-origin web mini app loaded in the
// FediModBrowser WebView, so the form steps run in the WEBVIEW context while
// the chat picker it hands off to is a native overlay.
//
// The groups must already exist (created by this actor) so the picker can
// attach them. Selectors here are the web-role equivalents the merged web
// test drives, and are its most fragile part if the tool's markup changes.
export async function createSpaceWithChats(
    t: AppiumTestBase,
    name: string,
    chatNames: string[],
): Promise<string> {
    console.log(`[${t.handle}] Creating Space "${name}" with [${chatNames}]`)

    // Native entry: Spaces header add -> create tab -> Create my Space, which
    // opens the community tool in the in-app browser.
    await t.clickElementByKey('HomeTabButton')
    await t.clickElementByKey('PlusButton')
    await t.clickElementByKey('createTab')
    await t.clickOnText('Create my Space', 0, true)

    // Drive the tool's DOM in the WebView context.
    await t.switchToWebviewContext()
    await t.clickWebElement('button=Create a Space')
    await t.typeWebElement('#name', name)
    await t.typeWebElement('#welcome', `Welcome to ${name}`)
    await t.clickWebElement('button=Next') // past the required first step
    await t.clickWebElement('button=Next') // skip the optional Mini Apps step

    // "Add Group Chat" hands off to the app's native chat picker, rendered
    // outside the WebView, so drop back to the native context to select.
    await t.clickWebElement('button=Add Group Chat')
    await t.switchToNativeContext()
    for (const chatName of chatNames) {
        await t.clickOnText(chatName, 0, true)
    }
    await t.clickOnText('Continue', 0, true)

    // Back in the tool to publish and capture the invite.
    await t.switchToWebviewContext()
    await t.clickWebElement('button=Publish')
    await t.clickWebElement('button=Confirm')

    // Copy Invite hands the code to navigator.clipboard.writeText, which from
    // a WebView never reaches Android's system clipboard. Wrap writeText to
    // capture whatever the button passes it, which is permission-independent.
    await t.driver.execute(
        'window.__fediInvite = "";' +
            'if (navigator.clipboard) {' +
            '  const orig = navigator.clipboard.writeText.bind(navigator.clipboard);' +
            '  navigator.clipboard.writeText = text => {' +
            '    window.__fediInvite = text;' +
            '    return orig(text).catch(() => {});' +
            '  };' +
            '}',
    )
    await t.clickWebElement('button=Copy Invite')

    const deadline = Date.now() + 15000
    let invite = ''
    while (Date.now() < deadline) {
        invite = (await t.driver.execute(
            'return window.__fediInvite || ""',
        )) as unknown as string
        if (invite.toLowerCase().startsWith('fedi:community')) break
        await new Promise(resolve => setTimeout(resolve, 500))
    }
    await t.switchToNativeContext()
    if (!invite.toLowerCase().startsWith('fedi:community')) {
        throw new Error(`Expected a community invite, captured: "${invite}"`)
    }
    return invite
}
