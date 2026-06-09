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
        command: `yarn dev --port ${webE2ePort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
})
