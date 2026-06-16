import { BasePage } from './base.page'

// Drives the join-community-then-federation deep link: one link that joins a
// community first, then chains into the wallet-service (federation) join.
export class OnboardingJoinPage extends BasePage {
    openDeepLink(community: string, federation: string) {
        const params = new URLSearchParams({
            screen: 'join-then-join',
            community,
            federation,
        })
        return this.goto(`/link?${params.toString()}`)
    }

    // A seedless session hitting the deep link is bounced to the welcome screen
    // with the join params preserved. Creating a seed resumes the join.
    async onboardToResumeJoin() {
        await this.startOnboardingFromWelcome()
        await this.waitForUrl('**/onboarding/join**', 60_000)
    }

    communityName(name: string) {
        return this.page.getByText(name, { exact: true })
    }

    joinCommunityButton() {
        return this.page.getByRole('button', {
            name: 'Join Space',
            exact: true,
        })
    }

    // Joining the community re-navigates to ?id=<federation>, which flips the
    // remount key so the second join mounts fresh.
    waitForFederationRemount(federation: string, timeout = 60_000) {
        return this.page.waitForURL(
            url =>
                url.pathname.endsWith('/onboarding/join') &&
                url.searchParams.get('id') === federation,
            { timeout },
        )
    }

    federationName() {
        return this.page.getByTestId('federation-preview-name')
    }

    joinFederationButton() {
        return this.page.getByRole('button', {
            name: 'Join Wallet Service',
            exact: true,
        })
    }

    waitForWallet(timeout = 180_000) {
        return this.waitForUrl('**/wallet', timeout)
    }
}
