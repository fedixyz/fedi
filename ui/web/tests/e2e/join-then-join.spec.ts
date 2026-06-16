import { nightlyFederationInvite } from '../utils/federations'
import { E2E_LONG_TIMEOUT } from './fixtures/constants'
import { test, expect } from './fixtures/test'

// Joined via the deep link below. The nightly meta is the source of truth for
// the code (guarded by tests/unit/utils/federations.test.ts); signet, so no
// real funds.
const FEDI_TESTNET = nightlyFederationInvite('Fedi Testnet')

// Self-contained: the creator publishes a fresh community in the community tool,
// then a second brand-new session joins it and Fedi Testnet via one deep link.
test('a created community and a federation are joined through one deep link', async ({
    onboarding,
    communityTool,
    onboardingJoin,
}) => {
    test.setTimeout(E2E_LONG_TIMEOUT)

    // Creator: onboard, then publish a minimal community via the community tool.
    await onboarding.completeWithNewSeed()
    const community = await communityTool.createSpace('E2E Test Space')

    // Joiner: a brand-new session opens the deep link and onboards into it.
    await onboardingJoin.openDeepLink(community, FEDI_TESTNET)
    await onboardingJoin.onboardToResumeJoin()

    await expect(onboardingJoin.communityName('E2E Test Space')).toBeVisible({
        timeout: 60_000,
    })
    await onboardingJoin.joinCommunityButton().click()

    await onboardingJoin.waitForFederationRemount(FEDI_TESTNET)
    await expect(onboardingJoin.federationName()).toHaveText('Fedi Testnet', {
        timeout: 60_000,
    })
    await onboardingJoin.joinFederationButton().click()
    await onboardingJoin.waitForWallet()
})
