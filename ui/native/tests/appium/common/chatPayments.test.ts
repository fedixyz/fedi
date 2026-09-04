/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { setupOnboardedLocalFed } from '../fixtures/setupOnboardedLocalFed'
import {
    generateDevfedEcash,
    getDevfedInvite,
    reverseDevfedPortsIntoDevices,
} from './devfed'
import {
    dismissBackupReminderIfPresent,
    enterAmount,
    ensureSatsMode,
    goToWallet,
    readWalletSats,
    redeemEcash,
    waitForWalletReceive,
} from './wallet'

// Money moving inside a direct message. Ecash underneath, but the claim runs
// off the chat event rather than a copied token.
//
// A same-federation payment is claimed by the recipient as soon as their
// device sees it, so there is no tap-to-receive leg. That only appears when
// the recipient is outside the sending federation.
//
// Cancelling a sent payment is not covered. The cancel control only exists
// while the payment is still pending, and two devices that are both online
// never leave it pending long enough. Reaching it needs the recipient
// offline, so it stays a manual check.

const FUND_SATS = 10000
const SEND_SATS = 500
const REQUEST_SATS = 300
const REJECT_SATS = 200
const ALICE_HELLO = 'e2e chat payments'

export class ChatPayments extends AppiumTestBase {
    // A local fed's invite only exists at runtime, so execute() joins both
    // actors itself.
    static prerequisites = [] as const
    static produces = ['onboarded', 'walletUsed', 'chatRoomsCreated'] as const
    static actors = 2

    async execute(): Promise<void> {
        console.log('Starting ChatPayments test')

        // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
        const alice: AppiumTestBase = this
        const bob = await this.spawnActor('b')

        console.log('[phase0] join local fed and fund alice')
        await reverseDevfedPortsIntoDevices()
        const invite = await getDevfedInvite()
        await setupOnboardedLocalFed(alice, invite)
        await setupOnboardedLocalFed(bob, invite)
        await redeemEcash(alice, await generateDevfedEcash(FUND_SATS * 1000))
        await alice.waitForText('Ecash claimed', 0, true, 120000)
        await alice.clickOnText('Go to wallet', 0, true)
        await waitForWalletReceive(alice)

        console.log('[phase1] open a direct message between the two')
        // A direct message deep link lands on a screen with no room behind it,
        // and the room is only created by sending into it. The in-chat wallet
        // control needs that room, so alice opens the link and sends first:
        // she is the one who pays first.
        const aliceProfile = await readOwnProfile(alice)
        const bobProfile = await readOwnProfile(bob)
        await openDirectMessage(alice, bobProfile.userId)
        await sendChatMessage(alice, ALICE_HELLO)

        // Bob only has an invite until he accepts it. A direct room is auto
        // joined only while the stability transfer chat UI is off, and it is
        // on by default, so the recipient of a first message has to accept a
        // connection request before the room is theirs.
        await enterRoom(bob, aliceProfile.displayName)

        console.log('[phase2] alice sends, bob receives')
        // Both opening balances are read before anything is sent. The
        // recipient's device claims the moment it renders the bubble, so a
        // reading taken afterwards already has the payment in it.
        const aliceStart = await balanceOnWallet(alice)
        const bobStart = await balanceOnWallet(bob)

        // Reading a balance steps out of the room, so every chat action has
        // to open it again.
        await enterRoom(alice, bobProfile.displayName)
        await sendChatPayment(alice, SEND_SATS)
        await alice.waitForText('Paid', 0, true, MATRIX_TIMEOUT)

        await enterRoom(bob, aliceProfile.displayName)
        await bob.waitForText('Received', 0, true, MATRIX_TIMEOUT)
        const bobAfterReceive = await balanceOnWallet(bob)
        if (bobAfterReceive !== bobStart + SEND_SATS) {
            throw new Error(
                `bob has ${bobAfterReceive} sats after the chat payment, expected ${bobStart + SEND_SATS}`,
            )
        }
        const aliceAfterSend = await balanceOnWallet(alice)
        if (aliceAfterSend >= aliceStart) {
            throw new Error(
                `alice has ${aliceAfterSend} sats after sending, expected below ${aliceStart}`,
            )
        }

        console.log('[phase3] bob requests, alice pays')
        await enterRoom(bob, aliceProfile.displayName)
        await requestChatPayment(bob, REQUEST_SATS)
        await enterRoom(alice, bobProfile.displayName)
        await alice.clickOnText('Pay', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('Paid', 0, true, MATRIX_TIMEOUT)
        const aliceAfterPaying = await balanceOnWallet(alice)
        if (aliceAfterPaying >= aliceAfterSend) {
            throw new Error(
                `alice has ${aliceAfterPaying} sats after paying a request, expected below ${aliceAfterSend}`,
            )
        }

        console.log('[phase4] bob requests, alice rejects')
        await enterRoom(bob, aliceProfile.displayName)
        await requestChatPayment(bob, REJECT_SATS)
        await enterRoom(alice, bobProfile.displayName)
        await alice.clickOnText('Reject', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('Rejected', 0, true, MATRIX_TIMEOUT)
        const aliceAfterReject = await balanceOnWallet(alice)
        if (aliceAfterReject !== aliceAfterPaying) {
            throw new Error(
                `alice has ${aliceAfterReject} sats after rejecting a request, expected no change from ${aliceAfterPaying}`,
            )
        }
        console.log('[phase4] rejected request moved no money')
    }

    catch(error: unknown) {
        console.error('Chat payments test failed:', error)
    }
}

type Profile = { userId: string; displayName: string }

// The settings drawer carries both halves of a person's identity: the member
// QR shares a universal link holding the matrix id, and the name sits beside
// it. The name is what titles their tile in the other person's chat list.
async function readOwnProfile(t: AppiumTestBase): Promise<Profile> {
    await t.clickElementByKey('HomeTabButton')
    await t.clickElementByKey('AvatarButton')
    await t.waitForElementDisplayed('UserQrContainer', MATRIX_TIMEOUT)
    const linkEl = await t.waitForElementDisplayed(
        'TrueUsername',
        MATRIX_TIMEOUT,
    )
    const raw = await linkEl.getText()
    // Either the universal link (`...?screen=user&id=@x:server`) or the
    // `fedi:user:@x:server` form, depending on the share method.
    const match = raw.match(/[#?&]id=([^&\s]+)/) || raw.match(/fedi:user:(\S+)/)
    if (!match) {
        throw new Error(`could not parse a matrix user id from "${raw}"`)
    }
    // The settings drawer closes rather than popping, so it carries a close
    // control and no back one.
    const displayName = (await t.getTextByKey('DisplayNameProper')).trim()
    if (!displayName) throw new Error('settings drawer showed no display name')
    await t.clickElementByKey('HeaderCloseButton')
    return { userId: decodeURIComponent(match[1]), displayName }
}

// The fedi:// scheme is registered in the manifest. The https universal link
// needs App Links verification that emulators do not perform reliably.
async function openDirectMessage(
    t: AppiumTestBase,
    userId: string,
): Promise<void> {
    await t.openDeepLink(`fedi://user/${encodeURIComponent(userId)}`)
    await t.waitForElementDisplayed('MessageInput-TextInput', MATRIX_TIMEOUT)
}

async function acceptConnectionRequest(t: AppiumTestBase): Promise<void> {
    if (await t.elementIsDisplayed('connection-request-banner', 15000)) {
        await t.clickOnText('Accept', 0, true)
    }
}

// Rooms are found by the other person's name, which titles their tile. The
// message preview underneath it changes with every payment, so matching on
// that would only work for the first visit. The tile can also lag matrix sync
// by more than the default wait.
async function enterRoom(t: AppiumTestBase, name: string): Promise<void> {
    if (await t.elementIsDisplayed('MessageInput-TextInput', 3000)) return
    // Receiving a chat payment can carry this device past the backup reminder
    // threshold, and that overlay covers the tab bar.
    await dismissBackupReminderIfPresent(t)
    await t.acceptIosNotificationPromptIfPresent()
    await t.clickElementByKey('ChatTabButton')
    await t.waitForElementDisplayed('SearchButton')
    await t.acceptIosNotificationPromptIfPresent()
    // Scrolling to the name resolves to the scroll container on ios, and the
    // tap then lands on whichever child it defaults to.
    const tileKey = `ChatTile-${name}`
    if (!(await t.scrollToElement(tileKey))) {
        throw new Error(`no chat tile titled "${name}"`)
    }
    await t.clickElementByKey(tileKey)
    // An invited room shows a connection request where the composer would be,
    // so accepting has to come before waiting for the composer.
    await acceptConnectionRequest(t)
    await t.waitForElementDisplayed('MessageInput-TextInput', MATRIX_TIMEOUT)
    await t.acceptIosNotificationPromptIfPresent(3000)
}

async function sendChatMessage(t: AppiumTestBase, text: string): Promise<void> {
    await t.typeIntoElementByKey('MessageInput-TextInput', text)
    await t.clickElementByKey('MessageInput-SendButton')
    // The first chat message raises the ios notification permission prompt,
    // which swallows every tap until it is answered and outlives an app reset.
    await t.acceptIosNotificationPromptIfPresent()
    await t.waitForText(text, 0, true, MATRIX_TIMEOUT)
}

// The wallet control only renders once the room is established as a direct
// chat on this device, which lags the first sync.
async function sendChatPayment(t: AppiumTestBase, sats: number): Promise<void> {
    await t.clickElementByKey('ChatWalletButton', MATRIX_TIMEOUT)
    await ensureSatsMode(t)
    await enterAmount(t, sats)
    await t.clickOnText('Send', 0, true)
    await t.clickElementByKey('SendConfirmButton', MATRIX_TIMEOUT)
}

async function requestChatPayment(
    t: AppiumTestBase,
    sats: number,
): Promise<void> {
    await t.clickElementByKey('ChatWalletButton', MATRIX_TIMEOUT)
    await ensureSatsMode(t)
    await enterAmount(t, sats)
    await t.clickOnText('Request', 0, true)
}

// A conversation is a full-screen view with no tab bar under it, so reading
// the balance means stepping out of the room first.
async function balanceOnWallet(t: AppiumTestBase): Promise<number> {
    // The recipient's prompt fires when its chat list fills, so it can already
    // be up on a device that has tapped nothing.
    await t.acceptIosNotificationPromptIfPresent(3000)
    if (await t.elementIsDisplayed('MessageInput-TextInput', 3000)) {
        await t.clickElementByKey('HeaderBackButton')
    }
    await goToWallet(t)
    return readWalletSats(t)
}
