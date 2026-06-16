import { defineConfig, devices } from '@playwright/test'

const webE2ePort = process.env.WEB_E2E_PORT || '34157'
const baseURL = `http://localhost:${webE2ePort}`

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    // Bridge init + federation ops can be slow
    timeout: 120_000,
    expect: {
        timeout: 15_000,
    },
    reporter: process.env.CI ? 'list' : 'html',
    use: {
        baseURL,
        // The community tool reads the minted invite code off the clipboard.
        permissions: ['clipboard-read', 'clipboard-write'],
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        // The bridge only runs in nightly flavor under a production build:
        // getAppFlavor returns 'dev' whenever NODE_ENV=development (i.e. `next
        // dev`). Nightly is what lets the suite create communities and reach
        // Fedi Testnet, matching the deployed Fedi Ashen environment.
        command: `yarn build && yarn start --port ${webE2ePort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            FEDI_ENV: 'nightly',
            NEXT_PUBLIC_FEDI_ENV: 'nightly',
        },
    },
})
