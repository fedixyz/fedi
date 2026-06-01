/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

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
    }
    catch(error: unknown) {
        console.error('Backup/Restore test failed:', error)
    }
}
