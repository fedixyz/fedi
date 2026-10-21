/* eslint-disable no-console */
import { randomUUID } from 'crypto'
import WebSocket from 'ws'

import { resources } from '@fedi/common/localization'
import type {
    RpcMethodNames,
    RpcPayload,
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
import {
    generateDevfedEcash,
    getDevfedInvite,
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
// Cancelling a sent payment is not covered. The cancel control only exists
// while the payment is still pending, and two devices that are both online
// never leave it pending long enough. Reaching it needs the recipient
// offline, so it stays a manual check.

const en = resources.en.translation
const FAILED_PAYMENT_SENDER = 'Spent ecash sender'
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

        console.log('[spent-ecash] reject a payment with already-spent notes')
        await assertSpentEcashRejected(bob, invite, bobProfile)
        console.log('[spent-ecash] failed history and chat, unchanged balance')
    }

    catch(error: unknown) {
        console.error('Chat payments test failed:', error)
    }
}

type Profile = { userId: string; displayName: string }

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

async function assertSpentEcashRejected(
    t: AppiumTestBase,
    invite: string,
    recipient: Profile,
): Promise<void> {
    const openingBalance = await balanceOnWallet(t)

    const sender = new PaymentSender()
    try {
        await sender.initialize()
        await sender.rpc('completeOnboardingNewSeed', {})
        const account = await sender.rpc('matrixGetAccountSession', {
            cached: false,
        })
        await sender.rpc('matrixSetDisplayName', {
            displayName: FAILED_PAYMENT_SENDER,
        })
        const federation = await sender.rpc('joinFederation', {
            inviteCode: invite,
            recoverFromScratch: false,
        })
        const ecash = await generateDevfedEcash(SEND_SATS * 1000)
        const [, operationId] = await sender.rpc('receiveEcash', {
            federationId: federation.id,
            ecash,
            frontendMetadata: {
                initialNotes: null,
                senderMatrixId: null,
                recipientMatrixId: null,
            },
        })
        await sender.waitForReceive(federation.id, operationId)

        const roomId = await sender.rpc('matrixRoomCreateOrGetDm', {
            userId: recipient.userId,
        })
        const paymentId = randomUUID()
        await sender.watchPayment(roomId, paymentId)
        await sender.rpc('matrixSendMessage', {
            roomId,
            data: {
                msgtype: 'm.text',
                body: 'Payment status test',
                data: {},
                mentions: null,
            },
        })
        await enterRoom(t, FAILED_PAYMENT_SENDER)
        await t.waitForText('Payment status test', 0, false, MATRIX_TIMEOUT)
        await sender.rpc('matrixSendMessage', {
            roomId,
            data: {
                msgtype: 'xyz.fedi.payment',
                body: 'Sent payment of 500 SATS.',
                data: {
                    paymentId,
                    status: 'pushed',
                    amount: SEND_SATS * 1000,
                    senderId: account.userId,
                    recipientId: recipient.userId,
                    federationId: federation.id,
                    inviteCode: invite,
                    ecash,
                },
                mentions: null,
            },
        })
        await t.waitForText('sent you', 0, false, MATRIX_TIMEOUT)

        await t.clickElementByKey('HeaderBackButton')
        await goToWallet(t)
        await t.clickElementByKey('BalanceCard__TransactionHistory')
        await t.waitForText(en.words.failed, 0, true, 120000)
        await t.saveScreenshot('chat-payment-failed-history')
        await t.clickOnText(en.words.failed, 0, true)
        await t.clickElementByKey('HistoryDetailCloseButton')
        await t.clickElementByKey('HeaderBackButton')
        const closingBalance = await readWalletSats(t)
        if (closingBalance !== openingBalance) {
            throw new Error(
                `spent ecash changed recipient balance from ${openingBalance} to ${closingBalance}`,
            )
        }

        await enterRoom(t, FAILED_PAYMENT_SENDER)
        await t.saveScreenshot('chat-payment-failed-receipt')
        if (await t.isTextPresent(en.words.received, true, 3000)) {
            throw new Error(
                'chat says Received for a failed payment that credited no money',
            )
        }
        await t.waitForText(en.words.failed, 0, true, MATRIX_TIMEOUT)
        await t.waitForText(
            en.feature.chat['payment-failed-recipient'],
            0,
            true,
        )
        await t.clickOnText(en.feature.chat['payment-view-history'], 0, true)
        await t.waitForElementDisplayed('transaction-item', MATRIX_TIMEOUT)
        await t.clickElementByKey('HeaderBackButton')

        await sender.waitForPaymentStatus('failed')
        // statuses are recorded in the order the sender's timeline first
        // showed them
        const statuses = sender.paymentStatuses
        const receiving = statuses.indexOf('receiving')
        if (
            receiving === -1 ||
            receiving > statuses.indexOf('failed') ||
            statuses.includes('received')
        ) {
            throw new Error(
                `sender saw payment statuses ${statuses.join(', ')}, expected receiving then failed and never received`,
            )
        }
    } finally {
        await sender.close()
    }
    await t.clickElementByKey('HeaderBackButton')
}

class PaymentSender {
    private readonly deviceId = `test:chat-payment:${randomUUID()}`
    private readonly baseUrl = `http://127.0.0.1:${process.env.REMOTE_BRIDGE_PORT}/${this.deviceId}`
    private events: WebSocket | undefined
    readonly paymentStatuses: string[] = []

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

    async watchPayment(roomId: string, paymentId: string): Promise<void> {
        this.events?.on('message', raw => {
            const message = JSON.parse(raw.toString())
            if (message.event !== 'streamUpdate') return
            collectPaymentStatuses(
                JSON.parse(message.data),
                paymentId,
                this.paymentStatuses,
            )
        })
        await this.rpc('matrixSubscribeRoomTimelineItems', {
            streamId: 1 as RpcVecDiffStreamId<RpcTimelineItem>,
            roomId,
        })
    }

    async waitForPaymentStatus(status: string): Promise<void> {
        const deadline = Date.now() + MATRIX_TIMEOUT
        while (!this.paymentStatuses.includes(status)) {
            if (Date.now() > deadline) {
                throw new Error(
                    `sender never saw a ${status} payment status, saw ${this.paymentStatuses.join(', ')}`,
                )
            }
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }

    async waitForReceive(federationId: string, operationId: string) {
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
            if (transaction.state?.type === 'done') return
            if (transaction.state?.type === 'failed') {
                throw new Error('fixture failed to spend its ecash')
            }
            await new Promise(resolve => setTimeout(resolve, 500))
        }
        throw new Error('fixture ecash did not settle')
    }

    async close() {
        this.events?.close()
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
                    `fixture ${path} failed: ${JSON.stringify(body)}`,
                )
            }
            return body
        } finally {
            clearTimeout(timeout)
        }
    }
}

function collectPaymentStatuses(
    value: unknown,
    paymentId: string,
    statuses: string[],
): void {
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (
        record.paymentId === paymentId &&
        typeof record.status === 'string' &&
        !statuses.includes(record.status)
    ) {
        statuses.push(record.status)
    }
    Object.values(record).forEach(child =>
        collectPaymentStatuses(child, paymentId, statuses),
    )
}
