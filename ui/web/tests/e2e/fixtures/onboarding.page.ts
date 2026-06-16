import { BasePage } from './base.page'

export class OnboardingPage extends BasePage {
    async completeWithNewSeed() {
        await this.goto('/')
        await this.startOnboardingFromWelcome()
        await this.waitForUrl('**/wallet', 120_000)
    }
}
