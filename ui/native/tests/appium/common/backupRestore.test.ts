/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import {
    ALL_GROUPS,
    createGroupAndSendMessage,
    Group,
    switchToChatTab,
} from './chatGroups'

// Recovery + matrix re-init can lag the join by a while on a loaded CI
// emulator; this is a generous upper bound for the identity fields to mount
// (normally they appear within a second or two and the waits return at once).
const IDENTITY_TIMEOUT = 120_000

// Non-public rooms are end-to-end encrypted (room_create enables encryption
// for every non-public room), so their message history is restored via
// matrix's *async* server-side key backup — BackupDownloadStrategy is
// AfterDecryptionFailure, meaning the room keys are only fetched once a
// decryption attempt fails. That download can lag a from-scratch recovery well
// past the default gate window, so we actively drive the decryption attempt and
// wait up to this bound for the restored history to land.
const ENCRYPTED_RECOVERY_TIMEOUT = 240_000

export class BackupRestore extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    static produces = ['onboarded'] as const

    // Retry the avatar tap until Settings is actually mounted, then wait for the
    // username before reading: right after a recovery the home screen can be busy
    // enough that the tap doesn't register, and matrixAuth (which the QR/username
    // render from) loads late, so Settings shows a spinner first.
    private async readProfileIdentity(): Promise<{
        trueUsername: string
        displayNameProper: string
        displayNameSuffix: string
    }> {
        await this.clickAndCheckForNextElement(
            'AvatarButton',
            'UserQrContainer',
            IDENTITY_TIMEOUT,
        )
        await this.waitForElementDisplayed('TrueUsername', IDENTITY_TIMEOUT)
        await this.waitForElementDisplayed(
            'DisplayNameProper',
            IDENTITY_TIMEOUT,
        )

        return {
            trueUsername: await this.getTextByKey('TrueUsername'),
            displayNameProper: await this.getTextByKey('DisplayNameProper'),
            displayNameSuffix: await this.getTextByKey('DisplayNameSuffix'),
        }
    }

    // Actively drive matrix into recovering an encrypted room's last message.
    // Reading the chat-list preview races the async key backup and loses, so
    // instead open the room (rendering its timeline attempts decryption, which
    // on failure kicks off the key download) and poll while nudging the
    // timeline until the message decrypts or the bound elapses. Returns the
    // elapsed seconds when the message appears, or null if it never recovered —
    // the timing is the diagnostic signal for how long real recovery takes.
    private async recoverEncryptedMessage(
        group: Group,
    ): Promise<number | null> {
        await this.scrollToElement(`ChatTile-${group.name}`)
        await this.clickElementByKey(`ChatTile-${group.name}`)
        await this.waitForElementDisplayed(
            'MessageInput-TextInput',
            MATRIX_TIMEOUT,
        )

        const start = Date.now()
        let found = false
        while (Date.now() - start < ENCRYPTED_RECOVERY_TIMEOUT) {
            if (await this.findElementByText(group.message, 0, false, 20_000)) {
                found = true
                break
            }
            // Scrolling the timeline forces the client to re-attempt decryption
            // of the surrounding events, which is what triggers the
            // AfterDecryptionFailure key-backup download.
            await this.scroll('up', 1000, 50)
            await this.scroll('down', 1000, 50)
        }
        await this.clickElementByKey('HeaderBackButton') // room -> chat list
        return found ? Math.round((Date.now() - start) / 1000) : null
    }

    async execute(): Promise<void> {
        console.log('Starting Backup/Restore Test')

        // Groups must exist before the backup so recovery has something to
        // restore; the post-recovery check below verifies they came back.
        console.log('Seeding chat groups before backup')
        await switchToChatTab(this)
        for (const group of ALL_GROUPS) {
            await createGroupAndSendMessage(this, group)
            await this.clickElementByKey('HeaderBackButton') // room -> chat list
        }
        await this.clickElementByKey('HomeTabButton')

        const { trueUsername, displayNameProper, displayNameSuffix } =
            await this.readProfileIdentity()
        await this.scrollToElement('Personal Backup')
        await this.clickElementByKey('Personal Backup')
        await this.scrollToElement('SeedWord12')
        const seedWords: string[] = []
        for (let i = 1; i <= 12; i++) {
            const word = await this.getTextByKey(`SeedWord${i}`)
            seedWords.push(word)
        }
        console.log(
            `Captured seed phrase:\n${seedWords.map((word, i) => `  ${i + 1}. ${word}`).join('\n')}`,
        )
        await this.clickElementByKey('ContinueButton')
        await this.resetAppToFresh()
        await this.clickElementByKey('Restore access')
        await this.clickElementByKey('Start personal recovery')
        for (let i = 0; i < seedWords.length; i++) {
            const key = `SeedWordInput${i + 1}`
            await this.scrollToElement(key)
            await this.typeIntoElementByKey(key, seedWords[i])
        }
        await this.clickElementByKey('Recover wallet')
        await this.clickElementByKey('Okay')
        await this.clickElementByKey('TransferExistingWalletButton')
        await this.clickElementByKey('Continue')
        await this.clickElementByKey('DeviceIndex0Button')
        await this.clickElementByKey('ManualSetupButton')
        // Recovery repopulates chatList, firing the notification prompt over
        // the federation list; clear it before the FediTestnetJoinButton tap.
        await this.acceptIosNotificationPromptIfPresent(MATRIX_TIMEOUT)
        await this.scrollToElement('FediTestnetJoinButton')
        await this.clickElementByKey('FediTestnetJoinButton')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        await this.clickElementByKey('JoinFederationButton')

        console.log('Verifying identity matches pre-recovery state')

        const {
            trueUsername: recoveredTrueUsername,
            displayNameProper: recoveredDisplayNameProper,
            displayNameSuffix: recoveredDisplayNameSuffix,
        } = await this.readProfileIdentity()

        const mismatches: string[] = []
        if (recoveredTrueUsername !== trueUsername) {
            mismatches.push(
                `TrueUsername: expected "${trueUsername}", got "${recoveredTrueUsername}"`,
            )
        }
        if (recoveredDisplayNameProper !== displayNameProper) {
            mismatches.push(
                `DisplayNameProper: expected "${displayNameProper}", got "${recoveredDisplayNameProper}"`,
            )
        }
        if (recoveredDisplayNameSuffix !== displayNameSuffix) {
            mismatches.push(
                `DisplayNameSuffix: expected "${displayNameSuffix}", got "${recoveredDisplayNameSuffix}"`,
            )
        }

        if (mismatches.length > 0) {
            throw new Error(
                `Identity mismatch after recovery:\n  ${mismatches.join('\n  ')}`,
            )
        }

        console.log(
            'Identity verified - all three fields match pre-recovery state',
        )

        console.log('Verifying chat groups survived recovery')

        await this.clickElementByKey('HeaderCloseButton') // close the avatar/account overlay
        await this.clickElementByKey('ChatTabButton')
        await this.waitForElementDisplayed('SearchButton')

        const missingGroups: string[] = []
        const missingMessages: string[] = []
        for (const group of ALL_GROUPS) {
            const tile = await this.scrollToText(group.name, 0, false)
            if (!tile) {
                missingGroups.push(group.name)
                continue
            }

            if (group.isPublic) {
                // Unencrypted: no key backup to wait out, just a lazy
                // preview that can lag matrix sync under CI load.
                const preview = await this.findElementByText(
                    group.message,
                    0,
                    false,
                    MATRIX_TIMEOUT,
                )
                if (!preview) {
                    missingMessages.push(`"${group.name}" → "${group.message}"`)
                }
                continue
            }

            // Encrypted: strictly assert the message recovers, but actively
            // drive and wait out the async key backup first.
            const elapsed = await this.recoverEncryptedMessage(group)
            if (elapsed === null) {
                console.error(
                    `[recovery] "${group.name}" message NOT recovered within ${ENCRYPTED_RECOVERY_TIMEOUT / 1000}s`,
                )
                missingMessages.push(`"${group.name}" → "${group.message}"`)
            } else {
                console.log(
                    `[recovery] "${group.name}" message decrypted after ~${elapsed}s`,
                )
            }
        }

        const chatFailures: string[] = []
        if (missingGroups.length > 0) {
            chatFailures.push(`Missing groups: ${missingGroups.join(', ')}`)
        }
        if (missingMessages.length > 0) {
            chatFailures.push(
                `Missing message previews: ${missingMessages.join(', ')}`,
            )
        }
        if (chatFailures.length > 0) {
            throw new Error(
                `Chat timeline mismatch after recovery:\n  ${chatFailures.join('\n  ')}`,
            )
        }

        console.log(
            `Chat timeline verified - all ${ALL_GROUPS.length} groups recovered with their messages`,
        )
        await this.clickElementByKey('HomeTabButton')
    }
    catch(error: unknown) {
        console.error('Backup/Restore test failed:', error)
    }
}
