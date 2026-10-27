/* eslint-disable no-console */
import { bech32m } from 'bech32'
import { execFileSync } from 'child_process'
import { createServer } from 'http'
import { AddressInfo } from 'net'

import { resources } from '@fedi/common/localization'

import AppiumManager from '../../configs/appium/AppiumManager'
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'
import { openFediTestnetPreview } from '../fixtures/setupOnboarded'
import { getNightlyFederationInvite } from './nightlyFederations'

const en = resources.en.translation
const CREATION_TITLE = en.feature['wallet-service']['guardian-set-title']
const INVALID_INVITE = en.errors['invalid-invite-code']
const APP_START_TIMEOUT = 60_000
const PIN = ['1', '2', '3', '4'] as const
const SPACE_NAME = 'E2E Invite Link Space'
const SPACE_WATCH_MS = 30_000
const SPACE_FETCH_DELAY_MS = 2_000

export class DeepLinks extends AppiumTestBase {
    static produces = ['onboarded', 'pinProtected'] as const

    private spaceFetches = 0

    async execute(): Promise<void> {
        console.log('Opening a Manifold creation link before onboarding')
        await this.waitForText(
            en.phrases['get-started'],
            0,
            true,
            APP_START_TIMEOUT,
        )
        await this.terminateApp()
        await this.openDeepLink('fedi://create-manifold')
        await this.waitForText(
            en.phrases['get-started'],
            0,
            true,
            APP_START_TIMEOUT,
        )
        await this.assertCreationHidden()
        await this.clickOnText(en.phrases['get-started'], 0, true)
        await this.assertCreationOpen()
        await this.backToWallet()

        for (const url of [
            'fedi:create-manifold',
            'https://app.fedi.xyz/link?screen=create-manifold',
            'https://app.fedi.xyz/link#screen=create-manifold',
        ]) {
            console.log(`Opening a warm Manifold creation link: ${url}`)
            await this.openDeepLink(url)
            await this.assertCreationOpen()
            await this.backToWallet()
        }

        console.log('Opening a Manifold HTTPS link from a cold start')
        await this.terminateApp()
        await this.openDeepLink(
            'https://app.fedi.xyz/link?screen=create-manifold',
        )
        await this.assertCreationOpen()
        await this.backToWallet()

        console.log('Joining Fedi Testnet')
        await this.clickElementByKey('ManualSetupButton')
        await openFediTestnetPreview(this)
        await this.clickElementByKey('JoinFederationButton')
        await this.clickElementByKey('HomeTabButton')
        await this.openSpaceInviteLinks()

        console.log('Opening a space invite link that does not decode')
        await this.openDeepLink('fedi://join/community1broken')
        await this.waitForText(INVALID_INVITE, 0, true, APP_START_TIMEOUT)
        await this.clickElementByKey('HeaderBackButton')

        console.log('Opening the invite link of a joined federation')
        await this.terminateApp()
        await this.openDeepLink(
            `fedi://join/${getNightlyFederationInvite('Fedi Testnet')}`,
        )
        await this.waitForElementDisplayed(
            'FediTestnetDetailsButton',
            APP_START_TIMEOUT,
        )
        if (await this.elementIsDisplayed('JoinFederationButton', 2000)) {
            throw new Error(
                'The invite link of a joined federation opened its preview',
            )
        }
        // the fifth launch after onboarding asks for analytics consent on home
        await this.clickElementByKey('HomeTabButton')
        await this.clickOnText(en.phrases['not-now'], 0, true)

        await this.enablePin()
        console.log('Opening a Manifold creation link while PIN protected')
        await this.terminateApp()
        await this.openDeepLink('fedi://create-manifold')
        await this.waitForElementDisplayed('NumpadButton-1', APP_START_TIMEOUT)
        await this.assertCreationHidden()

        await this.enterPin(['0', '0', '0', '0'])
        await this.waitForText(en.feature.pin['pin-doesnt-match'], 0, true)
        await this.assertCreationHidden()
        for (let i = 0; i < PIN.length; i++) {
            await this.clickElementByKey('NumpadButton-backspace')
        }

        await this.enterPin(PIN)
        await this.assertCreationOpen()
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForElementDisplayed('WalletTabButton')
        console.log('Deep links test complete')
    }

    private async openSpaceInviteLinks(): Promise<void> {
        const server = createServer((request, response) => {
            if (request.url !== '/space.json') {
                response.writeHead(404)
                response.end()
                return
            }
            this.spaceFetches++
            // a slow answer keeps the fetch open while wallet updates land
            setTimeout(() => {
                response.writeHead(200, {
                    'Content-Type': 'application/json',
                })
                response.end(JSON.stringify({ version: 1, name: SPACE_NAME }))
            }, SPACE_FETCH_DELAY_MS)
        })
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', resolve)
        })
        const { port } = server.address() as AddressInfo
        let forwardedDevice: string | undefined
        const invite = bech32m.encode(
            'fedi:community',
            bech32m.toWords(
                Buffer.from(
                    JSON.stringify({
                        community_meta_url: `http://127.0.0.1:${port}/space.json`,
                    }),
                ),
            ),
            1023,
        )
        const link = `fedi://join/${invite.replace('fedi:', '')}`

        try {
            if (currentPlatform === Platform.ANDROID) {
                const device = AppiumManager.deviceId(this.handle)
                if (!device) throw new Error('No Android device for the space')
                execFileSync('adb', [
                    '-s',
                    device,
                    'reverse',
                    `tcp:${port}`,
                    `tcp:${port}`,
                ])
                forwardedDevice = device
            }

            console.log('Opening a space invite link from the background')
            await this.driver.executeScript('mobile: backgroundApp', [
                { seconds: -1 },
            ])
            await this.watchSpacePreview(link, 'background')

            console.log('Opening a space invite link from a cold start')
            await this.terminateApp()
            await this.watchSpacePreview(link, 'cold start')
        } finally {
            if (forwardedDevice) {
                execFileSync('adb', [
                    '-s',
                    forwardedDevice,
                    'reverse',
                    '--remove',
                    `tcp:${port}`,
                ])
            }
            server.closeAllConnections()
            await new Promise<void>(resolve => server.close(() => resolve()))
        }
    }

    private async watchSpacePreview(
        link: string,
        label: string,
    ): Promise<void> {
        this.spaceFetches = 0
        await this.openDeepLink(link)
        await this.waitForElementDisplayed(
            'JoinFederationButton',
            APP_START_TIMEOUT,
        )
        let reloads = 0
        let shown = true
        const deadline = Date.now() + SPACE_WATCH_MS
        while (Date.now() < deadline) {
            const button = await this.findElementByKey('JoinFederationButton')
            const visible =
                button !== null &&
                (await button.isDisplayed().catch(() => false))
            if (shown && !visible) reloads++
            shown = visible
            await new Promise(resolve => setTimeout(resolve, 250))
        }
        console.log(
            `${label}: space preview left the screen ${reloads} times, fetched ${this.spaceFetches} times`,
        )
        if (reloads > 0 || this.spaceFetches !== 1) {
            await this.saveScreenshot(`space-preview-${label}`)
            throw new Error(
                `The ${label} space link fetched the space ${this.spaceFetches} times, and the preview left the screen ${reloads} times`,
            )
        }
        await this.waitForText(SPACE_NAME, 0, true)
        await this.clickElementByKey('HeaderBackButton')
    }

    private async assertCreationOpen(): Promise<void> {
        await this.waitForText(CREATION_TITLE, 0, true, APP_START_TIMEOUT)
        await this.waitForElementDisplayed(
            'guardian-count-headline',
            APP_START_TIMEOUT,
        )
    }

    private async assertCreationHidden(): Promise<void> {
        if (await this.isTextPresent(CREATION_TITLE, true, 1000)) {
            throw new Error('Manifold creation bypassed onboarding or PIN')
        }
    }

    private async backToWallet(): Promise<void> {
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForText(en.feature.wallet['setup-title'], 0, true)
        await this.waitForElementDisplayed('WalletTabButton')
    }

    private async enablePin(): Promise<void> {
        await this.clickElementByKey('HomeTabButton')
        await this.clickElementByKey('AvatarButton')
        await this.waitForElementDisplayed('UserQrContainer')
        await this.scrollToElement(en.feature.pin['pin-access'])
        await this.clickElementByKey(en.feature.pin['pin-access'])
        await this.clickOnText(en.words.continue, 0, true)
        await this.waitForElementDisplayed('SeedWord12')
        await this.clickOnText(
            en.feature.backup['personal-backup-button-primary-text'],
            0,
            true,
        )
        await this.enterPin(PIN)
        await this.waitForText(en.feature.pin['re-enter-pin'], 0, true)
        await this.enterPin(PIN)
        await this.clickOnText(en.words.done, 0, true)
        await this.waitForElementDisplayed('PinSwitch-app')
    }

    private async enterPin(digits: readonly string[]): Promise<void> {
        for (const digit of digits) {
            await this.clickElementByKey(`NumpadButton-${digit}`)
        }
    }

    private async terminateApp(): Promise<void> {
        await this.driver.executeScript('mobile: terminateApp', [
            currentPlatform === Platform.IOS
                ? { bundleId: process.env.BUNDLE_ID || 'org.fedi.alpha' }
                : { appId: process.env.APP_PACKAGE || 'com.fedi' },
        ])
    }

    catch(error: unknown) {
        console.error('Deep links test failed:', error)
    }
}
