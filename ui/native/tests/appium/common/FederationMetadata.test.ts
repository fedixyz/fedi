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
import {
    getDevfedInvite,
    reverseDevfedPortsIntoDevices,
    setDevfedMeta,
} from './devfed'

const en = resources.en.translation
const SELECTED_SPACE = 'E2E Selected Space'
const LINKED_SPACE = 'E2E Linked Space'
// Metadata refreshes every ten minutes; keep the app running through that fetch.
const META_REFRESH_TIMEOUT = 12 * 60_000

export class FederationMetadata extends AppiumTestBase {
    static produces = ['onboarded', 'metadataCommunitiesJoined'] as const

    async execute(): Promise<void> {
        const communities: Record<string, string> = {
            '/selected.json': SELECTED_SPACE,
            '/linked.json': LINKED_SPACE,
        }
        const server = createServer((request, response) => {
            const name = communities[request.url ?? '']
            response.writeHead(name ? 200 : 404, {
                'Content-Type': 'application/json',
            })
            response.end(JSON.stringify(name ? { version: 1, name } : {}))
        })
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', resolve)
        })
        const { port } = server.address() as AddressInfo
        console.log(`Community metadata fixture listening on 127.0.0.1:${port}`)
        let forwardedDevice: string | undefined
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
            await setDevfedMeta({ 'fedi:autojoin_communities': '[]' })
            await setupOnboardedLocalFed(this, await getDevfedInvite())
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
        } finally {
            try {
                await setDevfedMeta({ 'fedi:autojoin_communities': '[]' })
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
