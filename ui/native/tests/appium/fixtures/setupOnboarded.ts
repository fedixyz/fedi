/* eslint-disable no-console */
import { Fixture } from './types'

export const setupOnboarded: Fixture = {
    produces: 'onboarded',
    requires: [],
    async run(t) {
        console.log('Fixture: setupOnboarded')
        // 10s wait for the username generator to settle before "Get started" appears
        await new Promise(resolve => setTimeout(resolve, 10000))
        await t.clickElementByKey('Get started')
        await t.clickElementByKey('ManualSetupButton')
        await t.scrollToElement('FediTestnetJoinButton')
        await t.clickElementByKey('FediTestnetJoinButton')
        await t.clickElementByKey('JoinFederationButton')
        await t.clickElementByKey('HomeTabButton')
    },
}
