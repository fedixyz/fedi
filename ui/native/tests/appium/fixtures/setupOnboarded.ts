/* eslint-disable no-console */
import { Fixture } from './types'

export const setupOnboarded: Fixture = {
    produces: 'onboarded',
    requires: [],
    async run(t) {
        console.log('Fixture: setupOnboarded')
        await t.clickElementByKey('Get started')
        await t.clickElementByKey('ManualSetupButton')
        await t.scrollToElement('FediTestnetJoinButton')
        await t.clickElementByKey('FediTestnetJoinButton')
        await t.clickElementByKey('JoinFederationButton')
        await t.clickElementByKey('HomeTabButton')
    },
}
