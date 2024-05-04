import jest from '@jest/globals'
import { by, device, element, expect, log } from 'detox'

type LaunchArgs = {
    federationCode: string
}

describe('Basic Navigation', () => {
    beforeAll(async () => {
        device.appLaunchArgs.modify({
            federationCode: process.env.FEDERATION_CODE,
        })
        await device.launchApp({
            permissions: { camera: 'YES', microphone: 'YES' },
        })
    })
    beforeEach(async () => {
        await device.reloadReactNative()
    })

    it('navigates from Splash to JoinFederation and back', async () => {
        // click join federation button
        const joinFederationButton = element(by.id('JoinFederationButton'))
        await expect(joinFederationButton).toBeVisible()
        await joinFederationButton.tap()
        const pasteFederationCodeButton = element(
            by.id('PasteFederationCodeButton'),
        )
        await expect(pasteFederationCodeButton).toBeVisible()
        const headerBackButton = element(by.id('HeaderBackButton'))
        await headerBackButton.tap()
        await expect(joinFederationButton).toBeVisible()
        if (device.getPlatform() === 'android') {
            await joinFederationButton.tap()
            await expect(pasteFederationCodeButton).toBeVisible()
            await device.pressBack()
            await expect(joinFederationButton).toBeVisible()
        }
    })

    // TODO: Actually test joining the federation with launchArgs.federationCode
    // which requires some code refactors since clipboard and camera scanner
    // are not directly accessible
    it('federation code loads from environment', async () => {
        const launchArgs = (await device.appLaunchArgs.get()) as LaunchArgs
        log.info('federationCode', launchArgs.federationCode)

        await jest.expect(launchArgs.federationCode).toBeDefined()
    })
})
