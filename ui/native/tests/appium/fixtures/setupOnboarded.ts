/* eslint-disable no-console */
import {
    AppiumTestBase,
    COLD_START_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { Fixture } from './types'

const PREVIEW_ATTEMPTS = 3

export async function openFediTestnetPreview(t: AppiumTestBase): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        await t.scrollToElement('FediTestnetJoinButton')
        await t.clickElementByKey('FediTestnetJoinButton')
        if (await t.elementIsDisplayed('JoinFederationButton')) return
        if (attempt === PREVIEW_ATTEMPTS) {
            throw new Error(
                `Fedi Testnet preview did not load after ${PREVIEW_ATTEMPTS} attempts`,
            )
        }
        console.log(
            `Fedi Testnet preview did not load (attempt ${attempt}), retrying`,
        )
        await t.clickElementByKey('HeaderBackButton')
    }
}

export const setupOnboarded: Fixture = {
    produces: 'onboarded',
    requires: [],
    async run(t) {
        console.log('Fixture: setupOnboarded')
        await t.clickElementByKey('Get started', COLD_START_TIMEOUT)
        await t.clickElementByKey('No')
        await t.clickElementByKey('ManualSetupButton')
        await openFediTestnetPreview(t)
        await t.clickElementByKey('JoinFederationButton')
        await t.clickElementByKey('HomeTabButton')
    },
}
