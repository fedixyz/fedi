/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import {
    ALL_GROUPS,
    createGroupAndSendMessage,
    switchToChatTab,
} from './chatGroups'

// Recovery + matrix re-init can lag the join by a while on a loaded CI
// emulator; this is a generous upper bound for the identity fields to mount
// (normally they appear within a second or two and the waits return at once).
const IDENTITY_TIMEOUT = 120_000

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
            const messagePreview = await this.findElementByText(
                group.message,
                0,
                false,
            )
            if (!messagePreview) {
                missingMessages.push(`"${group.name}" → "${group.message}"`)
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
            `Chat timeline verified - all ${ALL_GROUPS.length} groups present with correct previews`,
        )
        await this.clickElementByKey('HomeTabButton')
    }
    catch(error: unknown) {
        console.error('Backup/Restore test failed:', error)
    }
}
