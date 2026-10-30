/* eslint-disable no-console */
import { bech32m } from 'bech32'
import { execFileSync } from 'child_process'
import { createServer } from 'http'
import { AddressInfo } from 'net'

import { resources } from '@fedi/common/localization'

import AppiumManager from '../../configs/appium/AppiumManager'
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'
import {
    acceptCameraPermissionIfPresent,
    allowPasteIfPrompted,
    setupOnboardedLocalFed,
} from '../fixtures/setupOnboardedLocalFed'
import { openDeveloperSettings } from './developerSettings'
import {
    getDevfedInvite,
    pauseDevfedGuardians,
    reverseDevfedPortsIntoDevices,
    setDevfedMeta,
} from './devfed'

const en = resources.en.translation
const SELECTED_SPACE = 'E2E Selected Space'
const LINKED_SPACE = 'E2E Linked Space'
// Metadata refreshes every ten minutes; keep the app running through that fetch.
const META_REFRESH_TIMEOUT = 12 * 60_000
const LIVE_WELCOME = 'E2E welcome from the federation'
const FEED_NAME = 'E2E Feed Federation'
const FEED_WELCOME = 'E2E welcome from the feed'
const DEVFED_DISCOVER_BUTTON = 'DevimintFederationJoinButton'
const ICON_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
)

export class FederationMetadata extends AppiumTestBase {
    static produces = ['onboarded', 'metadataCommunitiesJoined'] as const

    async execute(): Promise<void> {
        const devfedInvite = await getDevfedInvite()
        const discoverFeed = {
            'e2e-discover': {
                public: 'true',
                invite_code: devfedInvite,
                federation_name: FEED_NAME,
                preview_message: FEED_WELCOME,
            },
        }
        const communities: Record<string, string> = {
            '/selected.json': SELECTED_SPACE,
            '/linked.json': LINKED_SPACE,
        }
        const server = createServer((request, response) => {
            // the app's fetch adds a cache-busting query to the feed url
            const path = new URL(request.url ?? '/', 'http://fixture').pathname
            if (path === '/icon.png') {
                response.writeHead(200, { 'Content-Type': 'image/png' })
                response.end(ICON_PNG)
                return
            }
            const name = communities[path]
            const body =
                path === '/discover.json'
                    ? discoverFeed
                    : name && { version: 1, name }
            response.writeHead(body ? 200 : 404, {
                'Content-Type': 'application/json',
            })
            response.end(JSON.stringify(body || {}))
        })
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', resolve)
        })
        const { port } = server.address() as AddressInfo
        // android debug builds only allow cleartext http to localhost
        const appOrigin = `http://localhost:${port}`
        console.log(`Community metadata fixture listening on 127.0.0.1:${port}`)
        let forwardedDevice: string | undefined
        let resumeGuardians: (() => void) | undefined
        const invite = (route: string) =>
            bech32m.encode(
                'fedi:community',
                bech32m.toWords(
                    Buffer.from(
                        JSON.stringify({
                            community_meta_url: `http://127.0.0.1:${port}${route}`,
                        }),
                    ),
                ),
                1023,
            )

        try {
            if (currentPlatform === Platform.ANDROID) {
                const device = AppiumManager.deviceId(this.handle)
                if (!device)
                    throw new Error('No Android device for metadata fixture')
                execFileSync('adb', [
                    '-s',
                    device,
                    'reverse',
                    `tcp:${port}`,
                    `tcp:${port}`,
                ])
                forwardedDevice = device
            }
            await reverseDevfedPortsIntoDevices()
            await setDevfedMeta({
                'fedi:autojoin_communities': '[]',
                welcome_message: LIVE_WELCOME,
                federation_icon_url: `${appOrigin}/icon.png`,
            })
            await setupOnboardedLocalFed(this, devfedInvite)
            await this.clickElementByKey('PlusButton')
            await this.clickElementByKey('joinTab')
            await acceptCameraPermissionIfPresent(this)
            await this.setClipboard(invite('/selected.json'))
            await this.clickElementByKey('PasteButton')
            await allowPasteIfPrompted(this)
            if (currentPlatform === Platform.IOS) {
                await this.clickOnText(en.words.continue, 0, true)
            } else {
                await this.clickElementByKey(en.words.continue)
            }
            await this.clickElementByKey('JoinFederationButton')
            await this.waitForElementDisplayed('HomeHeaderTitle')
            await this.waitForText(SELECTED_SPACE, 0, true)

            await openDeveloperSettings(this)
            await this.scrollToElement('DiscoverFeedUrlInput', {
                maxScrolls: 30,
            })
            await this.typeIntoElementByKey(
                'DiscoverFeedUrlInput',
                `${appOrigin}/discover.json`,
            )
            await this.dismissKeyboard()
            await this.scrollToElement('LoadDiscoverFeedButton')
            await this.clickElementByKey('LoadDiscoverFeedButton')
            await this.clickElementByKey('HeaderBackButton')
            await this.clickElementByKey('HeaderCloseButton')

            await this.clickElementByKey('WalletTabButton')
            await this.clickElementByKey('DevimintFederationDetailsButton')
            const [notice] =
                en.feature.communities[
                    'autojoined-community-notice-federation'
                ].split('<communityLink>')
            if (await this.isTextPresent(notice.trim(), false, 1000)) {
                throw new Error(
                    'Autojoin notice is present before the metadata update',
                )
            }

            console.log(
                'Publishing an autojoin link for an existing federation member',
            )
            await setDevfedMeta({
                'fedi:autojoin_communities': JSON.stringify([
                    invite('/linked.json'),
                ]),
            })
            await this.waitForText(
                notice.trim(),
                0,
                false,
                META_REFRESH_TIMEOUT,
            )
            await this.saveScreenshot('metadata-autojoin-notice')
            await this.clickElementByKey('HeaderBackButton')
            await this.openHomeTab()
            await this.waitForText(SELECTED_SPACE, 0, true)
            await this.saveScreenshot('metadata-autojoin-selected-space')

            await this.clickElementByKey('MainHeaderButtons__HamburgerIcon')
            await this.waitForElementDisplayed('E2ELinkedSpaceQRCodeButton')
            await this.clickOnText(LINKED_SPACE, 0, true)
            await this.waitForElementGone('E2ELinkedSpaceQRCodeButton')
            await this.waitForText(LINKED_SPACE, 0, true)
            await this.saveScreenshot('metadata-autojoin-linked-space')
            console.log(
                'Metadata autojoin preserved the selected space and displayed its notice',
            )

            // Discover can now only show previews fetched before it opened
            resumeGuardians = await pauseDevfedGuardians()
            await this.clickElementByKey('WalletTabButton')
            await this.waitForElementDisplayed(
                'DevimintFederationDetailsButton',
            )
            await this.clickElementByKey('PlusButton')
            await this.waitForText(LIVE_WELCOME, 0, true)
            await this.waitForElementDisplayed(DEVFED_DISCOVER_BUTTON)
            for (const text of [FEED_NAME, FEED_WELCOME]) {
                if (await this.isTextPresent(text, true, 2000)) {
                    throw new Error(
                        `Discover shows the feed copy "${text}" instead of the federation's own`,
                    )
                }
            }
            await this.waitForElementDisplayed('FederationLogo__Image')
            await this.saveScreenshot('discover-previews')
            console.log(
                'Discover shows the federation name, welcome and icon fetched before it opened',
            )
        } finally {
            try {
                resumeGuardians?.()
                await setDevfedMeta({
                    'fedi:autojoin_communities': '[]',
                    welcome_message: '',
                    federation_icon_url: '',
                })
            } finally {
                try {
                    if (forwardedDevice) {
                        execFileSync('adb', [
                            '-s',
                            forwardedDevice,
                            'reverse',
                            '--remove',
                            `tcp:${port}`,
                        ])
                    }
                } finally {
                    server.closeAllConnections()
                    await new Promise<void>((resolve, reject) => {
                        server.close(error =>
                            error ? reject(error) : resolve(),
                        )
                    })
                    console.log(
                        `Community metadata fixture stopped on port ${port}`,
                    )
                }
            }
        }
    }

    catch(error: unknown) {
        console.error('Federation metadata test failed:', error)
    }
}
