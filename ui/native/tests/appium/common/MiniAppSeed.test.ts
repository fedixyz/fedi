/* eslint-disable no-console */
import { resources } from '@fedi/common/localization'

import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform } from '../../configs/appium/types'
import { openCommunityTool } from './communityTool'

type SeedRequestResult =
    | { status: 'pending' }
    | { status: 'resolved'; seed: string }
    | { status: 'rejected'; message: string }

const en = resources.en.translation

const RESULT_KEY = '__fediMiniAppSeedResult'
const RESULT_TIMEOUT = 20_000
const DENY = en.words.deny
const APPROVE = en.words.approve
const CONSENT_TITLE = en.feature.fedimods['seed-request-title']
const CONSENT_DESCRIPTION = en.feature.fedimods['seed-request-description']

export class MiniAppSeed extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    static produces = ['onboarded'] as const
    static supportedPlatforms = [Platform.ANDROID] as const

    async execute(): Promise<void> {
        console.log('Starting mini-app seed test')

        await openCommunityTool(this)
        await this.switchToWebviewContext()
        await this.waitForSeedApi()

        const origin = await this.startSeedRequest()
        await this.assertConsentPrompt(origin)
        await this.clickOnText(DENY, 0, true)

        await this.switchToWebviewContext()
        const denied = await this.waitForSeedResult()
        if (
            denied.status !== 'rejected' ||
            !denied.message.includes('Mini app seed request denied')
        ) {
            throw new Error(
                `Expected a denied seed request, received ${JSON.stringify(denied)}`,
            )
        }

        await this.startSeedRequest()
        await this.assertConsentPrompt(origin)
        await this.clickOnText(APPROVE, 0, true)

        await this.switchToWebviewContext()
        const approved = await this.waitForSeedResult()
        if (
            approved.status !== 'resolved' ||
            !/^[0-9a-f]{32}$/.test(approved.seed)
        ) {
            throw new Error(
                `Expected a 16-byte lowercase hex seed, received ${JSON.stringify(approved)}`,
            )
        }

        await this.startSeedRequest()
        await this.assertConsentPrompt(origin)
        await this.clickOnText(APPROVE, 0, true)

        await this.switchToWebviewContext()
        const repeated = await this.waitForSeedResult()
        if (repeated.status !== 'resolved' || repeated.seed !== approved.seed) {
            throw new Error(
                'Repeated requests from one origin returned different seeds',
            )
        }

        await this.switchToNativeContext()

        // The runner only resets when the state ledger exceeds the next
        // test's prerequisites, so the screen this test ends on leaks into
        // the next suite.
        await this.clickElementByKey('CloseMiniAppButton')
        if (!(await this.elementIsDisplayed('HomeTabButton', 5000))) {
            await this.driver.back()
        }
        await this.clickElementByKey('HomeTabButton')
        console.log('Mini-app seed test complete')
    }

    private async waitForSeedApi(): Promise<void> {
        await this.driver.waitUntil(
            async () =>
                Boolean(
                    await this.driver.execute(
                        'return Boolean(window.fediInternal && window.fediInternal.getSeed)',
                    ),
                ),
            {
                timeout: RESULT_TIMEOUT,
                interval: 500,
                timeoutMsg: 'window.fediInternal.getSeed was not injected',
            },
        )
    }

    private async startSeedRequest(): Promise<string> {
        const origin = (await this.driver.execute(`
            window.${RESULT_KEY} = { status: 'pending' };
            window.fediInternal.getSeed().then(
                ({ seed }) => {
                    window.${RESULT_KEY} = { status: 'resolved', seed };
                },
                error => {
                    window.${RESULT_KEY} = {
                        status: 'rejected',
                        message: String(error && error.message ? error.message : error),
                    };
                },
            );
            return window.location.origin;
        `)) as unknown as string
        await this.switchToNativeContext()
        return origin
    }

    private async assertConsentPrompt(origin: string): Promise<void> {
        if (!(await this.isTextPresent(CONSENT_TITLE))) {
            throw new Error('Mini-app seed consent title was not displayed')
        }
        if (!(await this.isTextPresent(origin))) {
            throw new Error(`Requesting origin was not displayed: ${origin}`)
        }
        if (!(await this.isTextPresent(CONSENT_DESCRIPTION))) {
            throw new Error('Mini-app seed consent warning was not displayed')
        }
    }

    private async waitForSeedResult(): Promise<SeedRequestResult> {
        let result: SeedRequestResult | undefined
        await this.driver.waitUntil(
            async () => {
                result = (await this.driver.execute(
                    `return window.${RESULT_KEY}`,
                )) as unknown as SeedRequestResult | undefined
                return Boolean(result && result.status !== 'pending')
            },
            {
                timeout: RESULT_TIMEOUT,
                interval: 500,
                timeoutMsg: 'Timed out waiting for mini-app seed response',
            },
        )
        if (!result) throw new Error('Mini-app seed response was unavailable')
        return result
    }

    catch(error: unknown) {
        console.error('MiniAppSeed test failed:', error)
    }
}
