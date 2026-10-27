/* eslint-disable no-console */
import { randomUUID } from 'crypto'
import WebSocket from 'ws'

import { resources } from '@fedi/common/localization'
import type {
    JSONObject,
    RpcMethodNames,
    RpcPayload,
    RpcPaymentMessageContent,
    RpcResponse,
    RpcTimelineItem,
    RpcVecDiffStreamId,
} from '@fedi/common/types/bindings'

import {
    AppiumTestBase,
    COLD_START_TIMEOUT,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'
import { setupOnboardedLocalFed } from '../fixtures/setupOnboardedLocalFed'
import { readAppLog } from './appLogs'
import {
    generateDevfedEcash,
    getDevfedInvite,
    pauseDevfedGuardians,
    removeDevfedPortsFromDevice,
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
// Bob starts outside alice's federation, so he accepts her first payment
// and joins her federation from the receive sheet. Later payments are claimed
// as soon as his device sees them.
//
// Carol and bob's second device are headless bridges. They post statuses
// this app never sends: older app receipts and statuses from the sender.
//
// Cancelling a sent payment is not covered. The cancel control only exists
// while the payment is still pending, and two devices that are both online
// never leave it pending long enough. Reaching it needs the recipient
// offline, so it stays a manual check.

const en = resources.en.translation
const CAROL = 'Carol'
const FUND_SATS = 10000
const SEND_SATS = 500
const REQUEST_SATS = 300
const REJECT_SATS = 200
const BOB_PAYS_SATS = 100
const STALLED_SATS = 110
const EARLY_RECEIPT_SATS = 120
const SPOOFED_SATS = 130
const OTHER_DEVICE_SATS = 140
const ALICE_HELLO = 'e2e chat payments'
const CAROL_HELLO = 'Payment status test'
// Matches the claim timeout in claimMatrixPayment.
const CLAIM_WAIT_MS = 60000
const TIMELINE_STREAM = 1

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

        console.log('[phase0] join local fed and fund alice, bob joins nothing')
        await reverseDevfedPortsIntoDevices()
        const invite = await getDevfedInvite()
        await setupOnboardedLocalFed(alice, invite)
        await onboardWithoutFederation(bob)
        await redeemEcash(alice, await generateDevfedEcash(FUND_SATS * 1000))
        await alice.waitForText('Ecash claimed', 0, true, 120000)
        await alice.clickOnText('Go to wallet', 0, true)
        await waitForWalletReceive(alice)

        const aliceProfile = await readOwnProfile(alice)
        const bobProfile = await readOwnProfile(bob)

        console.log('[phase1] open a direct message between the two')
        // A direct message deep link lands on a screen with no room behind it,
        // and the room is only created by sending into it. The in-chat wallet
        // control needs that room, so alice opens the link and sends first:
        // she is the one who pays first.
        await openDirectMessage(alice, bobProfile.userId)
        await sendChatMessage(alice, ALICE_HELLO)

        // Bob only has an invite until he accepts it. A direct room is auto
        // joined only while the stability transfer chat UI is off, and it is
        // on by default, so the recipient of a first message has to accept a
        // connection request before the room is theirs.
        await enterRoom(bob, aliceProfile.displayName)

        console.log('[phase2] alice sends, bob joins her fed to receive')
        const aliceStart = await balanceOnWallet(alice)

        // Reading a balance steps out of the room, so every chat action has
        // to open it again.
        await enterRoom(alice, bobProfile.displayName)
        await sendChatPayment(alice, SEND_SATS)

        await enterRoom(bob, aliceProfile.displayName)
        await joinFederationToReceive(bob)
        await bob.waitForText('Received', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('Paid', 0, true, MATRIX_TIMEOUT)
        const bobAfterReceive = await balanceOnWallet(bob)
        if (bobAfterReceive !== SEND_SATS) {
            throw new Error(
                `bob has ${bobAfterReceive} sats after the chat payment, expected ${SEND_SATS}`,
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

        const carol = new HeadlessMember()
        const bobsOtherDevice = new HeadlessMember()
        // Alice idles from here on, and Appium ends a session after 600
        // seconds without a command.
        const keepAliceAwake = setInterval(() => {
            alice.driver.getWindowSize().catch(() => undefined)
        }, 120000)
        const restoreIdleWaits = await skipIdleWaits(bob)
        try {
            console.log('[carol] carol joins the fed and messages bob')
            const room = await openRoomWithBob(carol, invite, bobProfile)

            console.log(
                '[spent-ecash] reject a payment with already-spent notes',
            )
            const spent = await assertSpentEcashRejected(bob, carol, room)
            console.log(
                '[spent-ecash] failed history and chat, unchanged balance',
            )

            console.log("[sender-failed] carol reports bob's payment as failed")
            await assertSenderSeesFailure(bob, carol, room)

            console.log("[other-device] restore bob's seed on a second device")
            await restoreOnSecondDevice(bob, bobsOtherDevice, room)

            console.log('[stalled] claims wait out a federation that stopped')
            const stalled = await assertStalledReceiveSettles(
                bob,
                carol,
                bobsOtherDevice,
                room,
            )

            console.log("[offline] receipts posted while bob's app was closed")
            await assertReceiptsReconciledOnRelaunch(
                bob,
                carol,
                bobsOtherDevice,
                room,
                { spent, ...stalled },
            )
        } finally {
            clearInterval(keepAliceAwake)
            await restoreIdleWaits().catch(() => undefined)
            await carol.close()
            await bobsOtherDevice.close()
        }
    }

    catch(error: unknown) {
        console.error('Chat payments test failed:', error)
    }
}

type Profile = { userId: string; displayName: string }

type ChatRoom = {
    id: string
    federationId: string
    invite: string
    carolId: string
    bobId: string
}

type PaymentEvent = {
    eventId: string
    sender: string
    content: RpcPaymentMessageContent
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function onboardWithoutFederation(t: AppiumTestBase): Promise<void> {
    await t.clickElementByKey('Get started', COLD_START_TIMEOUT)
    await t.clickElementByKey('No')
    await t.waitForElementDisplayed('ManualSetupButton', 90000)
}

// ios simulators share the host's loopback, so only android can cut one
// device off the fed.
async function joinFederationToReceive(t: AppiumTestBase): Promise<void> {
    const cutOff = currentPlatform === Platform.ANDROID
    if (cutOff) await removeDevfedPortsFromDevice(t.handle)
    await t.clickOnText('Accept', 0, true, MATRIX_TIMEOUT)
    if (cutOff) {
        await t.waitForElementDisplayed('ReceiveForeignEcashIssue', 60000)
        await t.saveScreenshot('receive-sheet-unreachable')
        await reverseDevfedPortsIntoDevices()
        await t.clickElementByKey('ReceiveForeignEcashRetryButton')
    }
    await t.waitForText('Join new federation', 0, true, 60000)
    await t.saveScreenshot('receive-sheet-join')
    await t.clickOnText('Join new federation', 0, true)
    await t.clickElementByKey('JoinFederationButton', 60000)
}

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

async function readSeedWords(t: AppiumTestBase): Promise<string[]> {
    if (await t.elementIsDisplayed('MessageInput-TextInput', 3000)) {
        await t.clickElementByKey('HeaderBackButton')
    }
    await t.clickElementByKey('HomeTabButton')
    await t.clickElementByKey('AvatarButton')
    await t.scrollToElement('Personal Backup')
    await t.clickElementByKey('Personal Backup')
    await t.scrollToElement('SeedWord12')
    const words: string[] = []
    for (let i = 1; i <= 12; i++) {
        words.push((await t.getTextByKey(`SeedWord${i}`)).trim().toLowerCase())
    }
    await t.clickElementByKey('ContinueButton')
    await t.clickElementByKey('HeaderCloseButton')
    return words
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

// A pending payment's spinner keeps the app busy, and the driver waits up to
// ten seconds for idle before each command.
async function skipIdleWaits(t: AppiumTestBase): Promise<() => Promise<void>> {
    const { waitForIdleTimeout } = await t.driver.getSettings()
    await t.driver.updateSettings({ waitForIdleTimeout: 0 })
    return async () => {
        await t.driver.updateSettings({ waitForIdleTimeout })
    }
}

function appIdentity() {
    return currentPlatform === Platform.IOS
        ? { bundleId: process.env.BUNDLE_ID || 'org.fedi.alpha' }
        : { appId: process.env.APP_PACKAGE || 'com.fedi' }
}

async function closeApp(t: AppiumTestBase): Promise<void> {
    await t.driver.executeScript('mobile: terminateApp', [appIdentity()])
}

async function openApp(t: AppiumTestBase): Promise<void> {
    await t.driver.executeScript('mobile: activateApp', [appIdentity()])
    await t.waitForElementDisplayed('ChatTabButton', 90000)
}

// Reads only rendered bubbles, so scroll older payments into view first.
async function waitForPaymentBubble(
    t: AppiumTestBase,
    paymentId: string,
    status: string,
    help?: string,
): Promise<void> {
    const read = async (key: string) => {
        try {
            return (await t.getTextByKey(key)).trim()
        } catch {
            return undefined
        }
    }
    const deadline = Date.now() + MATRIX_TIMEOUT
    let shown = await read(`PaymentStatus-${paymentId}`)
    while (shown !== status && Date.now() < deadline) {
        await sleep(1000)
        shown = await read(`PaymentStatus-${paymentId}`)
    }
    if (shown !== status) {
        throw new Error(
            `payment ${paymentId} shows ${shown ? `"${shown}"` : 'no status'}, expected "${status}"`,
        )
    }
    if (help === undefined) return
    const shownHelp = await read(`PaymentHelp-${paymentId}`)
    if (shownHelp !== help) {
        throw new Error(
            `payment ${paymentId} explains "${shownHelp}", expected "${help}"`,
        )
    }
}

async function scrollToPayment(
    t: AppiumTestBase,
    paymentId: string,
): Promise<void> {
    const key = `PaymentStatus-${paymentId}`
    const found = await t.scrollToElement(key, {
        scrollDirection: 'up',
        scrollPercentage: 30,
        scrollDuration: 500,
        maxScrolls: 20,
    })
    if (!found) {
        throw new Error(`no payment ${paymentId} in the room`)
    }
}

async function openPaymentHistory(
    t: AppiumTestBase,
    paymentId: string,
): Promise<void> {
    await t.clickElementByKey(
        `PaymentButton-${paymentId}-${en.feature.chat['payment-view-history']}`,
    )
    await t.waitForElementDisplayed('transaction-item', MATRIX_TIMEOUT)
    await t.clickElementByKey('HeaderBackButton')
}

async function expectStatuses(
    carol: HeadlessMember,
    paymentId: string,
    sender: string,
    expected: string[],
    timeout = MATRIX_TIMEOUT,
): Promise<void> {
    const deadline = Date.now() + timeout
    let seen = carol.statuses(paymentId, sender)
    while (seen.join() !== expected.join() && Date.now() < deadline) {
        await sleep(500)
        seen = carol.statuses(paymentId, sender)
    }
    if (seen.join() !== expected.join()) {
        throw new Error(
            `bob posted ${seen.join(', ') || 'nothing'} for payment ${paymentId}, expected ${expected.join(', ')}`,
        )
    }
}

async function openRoomWithBob(
    carol: HeadlessMember,
    invite: string,
    bob: Profile,
): Promise<ChatRoom> {
    await carol.initialize()
    const carolId = await carol.onboard(CAROL)
    const federationId = await carol.joinFederation(invite)
    const id = await carol.rpc('matrixRoomCreateOrGetDm', {
        userId: bob.userId,
    })
    await carol.watchRoom(id)
    await carol.sendText(id, CAROL_HELLO)
    return { id, federationId, invite, carolId, bobId: bob.userId }
}

async function pushPayment(
    carol: HeadlessMember,
    room: ChatRoom,
    ecash: string,
    extra: Partial<RpcPaymentMessageContent> = {},
): Promise<RpcPaymentMessageContent> {
    // generate_ecash can overpay with a larger note.
    const { amount } = await carol.rpc('parseEcash', { ecash })
    const content: RpcPaymentMessageContent = {
        body: `Sent payment of ${Math.floor(amount / 1000)} SATS.`,
        status: 'pushed',
        paymentId: randomUUID(),
        amount,
        senderId: room.carolId,
        recipientId: room.bobId,
        federationId: room.federationId,
        inviteCode: room.invite,
        ecash,
        ...extra,
    }
    await carol.sendPayment(room.id, content)
    return content
}

async function assertSpentEcashRejected(
    bob: AppiumTestBase,
    carol: HeadlessMember,
    room: ChatRoom,
): Promise<PaymentEvent> {
    const openingBalance = await balanceOnWallet(bob)

    const ecash = await generateDevfedEcash(SEND_SATS * 1000)
    await carol.receiveEcash(room.federationId, ecash)
    await enterRoom(bob, CAROL)
    await bob.waitForText(CAROL_HELLO, 0, false, MATRIX_TIMEOUT)
    const { paymentId } = await pushPayment(carol, room, ecash)
    await bob.waitForText('sent you', 0, false, MATRIX_TIMEOUT)

    await bob.clickElementByKey('HeaderBackButton')
    await goToWallet(bob)
    await bob.clickElementByKey('BalanceCard__TransactionHistory')
    await bob.waitForText(en.words.failed, 0, true, 120000)
    await bob.saveScreenshot('chat-payment-failed-history')
    await bob.clickOnText(en.words.failed, 0, true)
    await bob.clickElementByKey('HistoryDetailCloseButton')
    await bob.clickElementByKey('HeaderBackButton')
    const closingBalance = await readWalletSats(bob)
    if (closingBalance !== openingBalance) {
        throw new Error(
            `spent ecash changed recipient balance from ${openingBalance} to ${closingBalance}`,
        )
    }

    await enterRoom(bob, CAROL)
    if (await bob.isTextPresent(en.words.received, true, 3000)) {
        throw new Error(
            'chat says Received for a failed payment that credited no money',
        )
    }
    await waitForPaymentBubble(
        bob,
        paymentId,
        en.words.failed,
        en.feature.chat['payment-failed-recipient'],
    )
    await bob.saveScreenshot('chat-payment-failed-receipt')
    await openPaymentHistory(bob, paymentId)

    await expectStatuses(carol, paymentId, room.bobId, ['receiving', 'failed'])
    return carol.waitForStatus(paymentId, room.bobId, 'failed')
}

async function assertSenderSeesFailure(
    bob: AppiumTestBase,
    carol: HeadlessMember,
    room: ChatRoom,
): Promise<void> {
    await enterRoom(bob, CAROL)
    await sendChatPayment(bob, BOB_PAYS_SATS)
    const { content } = await carol.waitForEvent(
        event =>
            event.sender === room.bobId && event.content.status === 'pushed',
        'a payment from bob',
    )

    await carol.sendPayment(room.id, {
        ...content,
        body: 'Receiving payment.',
        status: 'receiving',
    })
    await waitForPaymentBubble(
        bob,
        content.paymentId,
        en.words.pending,
        en.feature.chat['payment-confirming'],
    )
    await bob.saveScreenshot('chat-payment-sender-pending')

    await carol.sendPayment(room.id, {
        ...content,
        body: 'Payment failed.',
        status: 'failed',
    })
    await waitForPaymentBubble(
        bob,
        content.paymentId,
        en.words.failed,
        en.feature.chat['payment-failed-sender'],
    )
    await bob.saveScreenshot('chat-payment-sender-failed')
    await openPaymentHistory(bob, content.paymentId)
}

async function restoreOnSecondDevice(
    bob: AppiumTestBase,
    device: HeadlessMember,
    room: ChatRoom,
): Promise<void> {
    const seedWords = await readSeedWords(bob)
    await device.initialize()
    const userId = await device.restore(seedWords)
    if (userId !== room.bobId) {
        throw new Error(`bob's seed restored as ${userId}, not ${room.bobId}`)
    }
    await device.joinFederation(room.invite)
    await device.watchRoom(room.id)
}

async function assertStalledReceiveSettles(
    bob: AppiumTestBase,
    carol: HeadlessMember,
    bobsOtherDevice: HeadlessMember,
    room: ChatRoom,
): Promise<{
    stalledId: string
    earlyId: string
    settledOperationId?: string
    balance: number
}> {
    const openingBalance = await balanceOnWallet(bob)
    const stalledEcash = await generateDevfedEcash(STALLED_SATS * 1000)
    const earlyEcash = await generateDevfedEcash(EARLY_RECEIPT_SATS * 1000)
    await enterRoom(bob, CAROL)

    const confirming = en.feature.chat['payment-confirming']
    const resumeGuardians = await pauseDevfedGuardians()
    let stalled: RpcPaymentMessageContent
    let early: RpcPaymentMessageContent
    let stalledId: string
    let earlyId: string
    try {
        stalled = await pushPayment(carol, room, stalledEcash)
        early = await pushPayment(carol, room, earlyEcash)
        stalledId = stalled.paymentId
        earlyId = early.paymentId
        await carol.waitForStatus(stalledId, room.bobId, 'receiving')
        const earlyReceiving = await carol.waitForStatus(
            earlyId,
            room.bobId,
            'receiving',
        )
        const claimsGiveUp = Date.now() + CLAIM_WAIT_MS
        await bobsOtherDevice.sendPayment(room.id, {
            ...earlyReceiving.content,
            body: 'Payment received.',
            status: 'received',
        })
        await carol.waitForStatus(earlyId, room.bobId, 'received')

        while (Date.now() < claimsGiveUp + 5000) {
            await waitForPaymentBubble(
                bob,
                stalledId,
                en.words.receiving,
                confirming,
            )
            await waitForPaymentBubble(
                bob,
                earlyId,
                en.words.receiving,
                confirming,
            )
            await sleep(5000)
        }
        await bob.saveScreenshot('chat-payment-receiving')
        await expectStatuses(carol, stalledId, room.bobId, ['receiving'], 0)
        await expectStatuses(
            carol,
            earlyId,
            room.bobId,
            ['receiving', 'received'],
            0,
        )
    } finally {
        resumeGuardians()
    }

    const settled = await carol.waitForStatus(
        stalledId,
        room.bobId,
        'received',
        180000,
    )
    await waitForPaymentBubble(bob, stalledId, en.words.received)
    await waitForPaymentBubble(bob, earlyId, en.words.received)
    await bob.saveScreenshot('chat-payment-stalled-received')

    const balance = await balanceOnWallet(bob)
    expectCredited(
        openingBalance,
        balance,
        [stalled, early],
        'after the stalled payments settled',
    )
    return {
        stalledId,
        earlyId,
        settledOperationId: settled.content.receiverOperationId,
        balance,
    }
}

async function assertReceiptsReconciledOnRelaunch(
    bob: AppiumTestBase,
    carol: HeadlessMember,
    bobsOtherDevice: HeadlessMember,
    room: ChatRoom,
    earlier: {
        spent: PaymentEvent
        stalledId: string
        earlyId: string
        settledOperationId?: string
        balance: number
    },
): Promise<void> {
    const spoofedEcash = await generateDevfedEcash(SPOOFED_SATS * 1000)
    const otherDeviceEcash = await generateDevfedEcash(OTHER_DEVICE_SATS * 1000)
    const spentId = earlier.spent.content.paymentId
    await closeApp(bob)

    const spoofed = await pushPayment(carol, room, spoofedEcash, {
        receiverOperationId: earlier.settledOperationId,
    })
    await carol.sendPayment(room.id, {
        ...spoofed,
        body: 'Payment received.',
        status: 'received',
    })

    await bobsOtherDevice.sendPayment(room.id, {
        ...earlier.spent.content,
        body: 'Payment received.',
        status: 'received',
    })

    const other = await pushPayment(carol, room, otherDeviceEcash)
    const operationId = await bobsOtherDevice.receiveEcash(
        room.federationId,
        otherDeviceEcash,
    )
    await bobsOtherDevice.sendPayment(room.id, {
        ...other,
        body: 'Receiving payment.',
        status: 'receiving',
        receiverOperationId: operationId,
    })
    await bobsOtherDevice.sendPayment(room.id, {
        ...other,
        body: 'Payment received.',
        status: 'received',
        receiverOperationId: operationId,
    })
    await expectStatuses(carol, spentId, room.bobId, [
        'receiving',
        'failed',
        'received',
    ])
    await expectStatuses(carol, other.paymentId, room.bobId, [
        'receiving',
        'received',
    ])

    await openApp(bob)
    await enterRoom(bob, CAROL)
    await expectStatuses(carol, spoofed.paymentId, room.bobId, [
        'receiving',
        'received',
    ])
    await expectStatuses(carol, spentId, room.bobId, [
        'receiving',
        'failed',
        'received',
        'failed',
    ])
    await waitForPaymentBubble(bob, other.paymentId, en.words.received)
    await waitForPaymentBubble(bob, spoofed.paymentId, en.words.received)
    await bob.saveScreenshot('chat-payment-relaunch-receipts')
    await scrollToPayment(bob, earlier.earlyId)
    await waitForPaymentBubble(bob, earlier.earlyId, en.words.received)
    await scrollToPayment(bob, earlier.stalledId)
    await waitForPaymentBubble(bob, earlier.stalledId, en.words.received)
    await scrollToPayment(bob, spentId)
    await waitForPaymentBubble(
        bob,
        spentId,
        en.words.failed,
        en.feature.chat['payment-failed-recipient'],
    )
    await bob.saveScreenshot('chat-payment-relaunch-corrected')

    await expectStatuses(carol, earlier.stalledId, room.bobId, [
        'receiving',
        'received',
    ])
    await expectStatuses(carol, earlier.earlyId, room.bobId, [
        'receiving',
        'received',
    ])
    await expectStatuses(carol, other.paymentId, room.bobId, [
        'receiving',
        'received',
    ])
    await assertClaimedOnce(bob, carol, room, other.paymentId)

    const balance = await balanceOnWallet(bob)
    expectCredited(earlier.balance, balance, [spoofed], 'after reopening')
}

// Each message reruns the receivable check, so a receipt the app keeps
// retrying gets one more claim attempt per message.
async function assertClaimedOnce(
    bob: AppiumTestBase,
    carol: HeadlessMember,
    room: ChatRoom,
    paymentId: string,
): Promise<void> {
    const countLines = (...parts: string[]) =>
        (readAppLog(bob.handle, 'ui')?.toString() ?? '')
            .split('\n')
            .filter(line => parts.every(part => line.includes(part))).length
    const checks = () => countLines('Looking for receivable payment events')

    for (let i = 1; i <= 3; i++) {
        const before = checks()
        await carol.sendText(room.id, `${CAROL_HELLO} ${i}`)
        const deadline = Date.now() + MATRIX_TIMEOUT
        while (checks() === before) {
            if (Date.now() > deadline) {
                throw new Error(
                    `bob never checked for payments after message ${i}`,
                )
            }
            await sleep(1000)
        }
    }
    await sleep(2000)

    const attempts = countLines('attempting to claim', paymentId)
    if (attempts !== 1) {
        throw new Error(
            `bob tried to claim payment ${paymentId} ${attempts} times, expected once`,
        )
    }
}

// The receive fee and msat rounding move the balance by up to two sats.
function expectCredited(
    before: number,
    after: number,
    payments: RpcPaymentMessageContent[],
    when: string,
): void {
    const msats = payments.reduce((sum, payment) => sum + payment.amount, 0)
    const expected = before + Math.floor(msats / 1000)
    if (Math.abs(after - expected) > 2) {
        throw new Error(`bob has ${after} sats ${when}, expected ${expected}`)
    }
}

class HeadlessMember {
    private readonly deviceId = `test:chat-payment:${randomUUID()}`
    private readonly baseUrl = `http://127.0.0.1:${process.env.REMOTE_BRIDGE_PORT}/${this.deviceId}`
    private events: WebSocket | undefined
    readonly payments: PaymentEvent[] = []

    async initialize(): Promise<void> {
        await this.post('/init', {
            dataDir: '/remote-data',
            deviceIdentifier: this.deviceId,
            logLevel: 'info',
            appFlavor: { type: 'dev' },
        })
        const events = new WebSocket(
            `${this.baseUrl.replace('http:', 'ws:')}/events`,
        )
        this.events = events
        await new Promise<void>((resolve, reject) => {
            events.once('open', resolve)
            events.once('error', reject)
        })
    }

    async rpc<M extends RpcMethodNames>(
        method: M,
        payload: RpcPayload<M>,
    ): Promise<RpcResponse<M>> {
        const response = await this.post(`/rpc/${method}`, payload)
        return response.result
    }

    async onboard(displayName: string): Promise<string> {
        await this.rpc('completeOnboardingNewSeed', {})
        const account = await this.rpc('matrixGetAccountSession', {
            cached: false,
        })
        await this.rpc('matrixSetDisplayName', { displayName })
        return account.userId
    }

    async restore(seedWords: string[]): Promise<string> {
        await this.rpc('restoreMnemonic', { mnemonic: seedWords })
        await this.rpc('onboardRegisterAsNewDevice', { index: null })
        const account = await this.rpc('matrixGetAccountSession', {
            cached: false,
        })
        return account.userId
    }

    async joinFederation(invite: string): Promise<string> {
        const federation = await this.rpc('joinFederation', {
            inviteCode: invite,
            recoverFromScratch: false,
        })
        return federation.id
    }

    async receiveEcash(federationId: string, ecash: string): Promise<string> {
        const [, operationId] = await this.rpc('receiveEcash', {
            federationId,
            ecash,
            frontendMetadata: {
                initialNotes: null,
                senderMatrixId: null,
                recipientMatrixId: null,
            },
        })
        const deadline = Date.now() + 120000
        while (Date.now() < deadline) {
            const transaction = await this.rpc('getTransaction', {
                federationId,
                operationId,
            })
            if (transaction.kind !== 'oobReceive') {
                throw new Error(
                    `unexpected transaction kind ${transaction.kind}`,
                )
            }
            if (transaction.state?.type === 'done') return operationId
            if (transaction.state?.type === 'failed') {
                throw new Error('headless member failed to redeem its ecash')
            }
            await sleep(500)
        }
        throw new Error('headless member ecash did not settle')
    }

    // A device restored from a seed only knows the room once matrix has
    // synced it.
    async watchRoom(roomId: string): Promise<void> {
        this.events?.on('message', raw => {
            const message = JSON.parse(raw.toString())
            if (message.event !== 'streamUpdate') return
            const update = JSON.parse(message.data)
            if (update.stream_id !== TIMELINE_STREAM) return
            collectPaymentEvents(update.data, this.payments)
        })
        const deadline = Date.now() + MATRIX_TIMEOUT
        for (;;) {
            try {
                await this.rpc('matrixSubscribeRoomTimelineItems', {
                    streamId:
                        TIMELINE_STREAM as RpcVecDiffStreamId<RpcTimelineItem>,
                    roomId,
                })
                return
            } catch (error) {
                if (Date.now() > deadline) throw error
                await sleep(1000)
            }
        }
    }

    async sendText(roomId: string, body: string): Promise<void> {
        await this.rpc('matrixSendMessage', {
            roomId,
            data: { msgtype: 'm.text', body, data: {}, mentions: null },
        })
    }

    async sendPayment(
        roomId: string,
        content: RpcPaymentMessageContent,
    ): Promise<void> {
        const { body, ...data } = content
        await this.rpc('matrixSendMessage', {
            roomId,
            data: {
                msgtype: 'xyz.fedi.payment',
                body,
                data: data as JSONObject,
                mentions: null,
            },
        })
    }

    statuses(paymentId: string, sender: string): string[] {
        return this.payments
            .filter(
                event =>
                    event.content.paymentId === paymentId &&
                    event.sender === sender,
            )
            .map(event => event.content.status)
    }

    async waitForEvent(
        matches: (event: PaymentEvent) => boolean,
        description: string,
        timeout = MATRIX_TIMEOUT,
    ): Promise<PaymentEvent> {
        const deadline = Date.now() + timeout
        for (;;) {
            const event = this.payments.find(matches)
            if (event) return event
            if (Date.now() > deadline) {
                throw new Error(`carol never saw ${description}`)
            }
            await sleep(500)
        }
    }

    waitForStatus(
        paymentId: string,
        sender: string,
        status: string,
        timeout = MATRIX_TIMEOUT,
    ): Promise<PaymentEvent> {
        return this.waitForEvent(
            event =>
                event.content.paymentId === paymentId &&
                event.sender === sender &&
                event.content.status === status,
            `a ${status} status for payment ${paymentId}`,
            timeout,
        )
    }

    async close() {
        if (!this.events) return
        this.events.close()
        await this.post('/shutdown', {})
    }

    private async post(path: string, payload: object) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120000)
        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            })
            const body = await response.json()
            if (!response.ok || body.error) {
                throw new Error(
                    `headless member ${path} failed: ${JSON.stringify(body)}`,
                )
            }
            return body
        } finally {
            clearTimeout(timeout)
        }
    }
}

function collectPaymentEvents(value: unknown, events: PaymentEvent[]): void {
    if (!value || typeof value !== 'object') return
    const item = value as { id?: unknown; sender?: unknown; content?: unknown }
    if (
        typeof item.id === 'string' &&
        typeof item.sender === 'string' &&
        item.content &&
        typeof item.content === 'object'
    ) {
        const { msgtype, ...content } = item.content as {
            msgtype?: string
        } & RpcPaymentMessageContent
        if (msgtype === 'xyz.fedi.payment') {
            if (!events.some(event => event.eventId === item.id)) {
                events.push({ eventId: item.id, sender: item.sender, content })
            }
            return
        }
    }
    Object.values(value).forEach(child => collectPaymentEvents(child, events))
}
