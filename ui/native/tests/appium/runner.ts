/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import AppiumManager from '../configs/appium/AppiumManager'
import { AppiumTestBase } from '../configs/appium/AppiumTestBase'
import { OnboardingTest } from './common/onboarding.test'

type TestConstructor = new () => AppiumTestBase

const availableTests: Record<string, TestConstructor> = {
    onboarding: OnboardingTest,
}
type TestName = keyof typeof availableTests

// Add flag to track if any test failed
let anyTestFailed = false

async function waitForMetroBundleComplete(): Promise<void> {
    const timeout = 180000
    const startTime = Date.now()
    console.log('Checking if Metro bundle is complete...')

    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(async () => {
            try {
                // Try to make a request to the Metro bundler status endpoint
                const response = await fetch('http://localhost:8081/status')
                const status = await response.text()

                if (status.includes('packager-status:running')) {
                    console.log('Metro bundler is running')

                    const packagerResponse = await fetch(
                        'http://localhost:8081/index.bundle?platform=' +
                            (process.env.PLATFORM === 'ios'
                                ? 'ios'
                                : 'android') +
                            '&dev=true&minify=false&status=true',
                    )

                    if (packagerResponse.status === 200) {
                        console.log('Bundle is ready!')
                        clearInterval(checkInterval)
                        resolve()
                        return
                    }
                }

                if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval)
                    reject(new Error('Timed out waiting for Metro bundle'))
                }
            } catch (error: unknown) {
                console.log(
                    'Metro status check failed:',
                    (error as Error).message,
                )

                if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval)
                    reject(new Error('Timed out waiting for Metro bundle'))
                }
            }
        }, 5000)
    })
}

async function runTests(testNames: string[]): Promise<void> {
    const appiumManager = AppiumManager.getInstance()
    try {
        await appiumManager.setup()

        const validTestNames = testNames.filter(name =>
            Object.keys(availableTests).includes(name),
        ) as TestName[]

        if (validTestNames.length === 0) {
            console.error(
                'No valid tests selected. Available tests:',
                Object.keys(availableTests).join(', '),
            )
            // Exit with error if no valid tests found
            anyTestFailed = true
            return
        }

        try {
            await waitForMetroBundleComplete()
        } catch (error) {
            console.error('Failed to verify Metro bundle:', error)
            anyTestFailed = true
            return
        }

        console.log(`Running the following tests: ${validTestNames.join(', ')}`)

        const results: Record<string, { success: boolean; error?: unknown }> =
            {}

        for (const testName of validTestNames) {
            console.log(`\n=== Starting test: ${testName} ===`)

            try {
                const TestClass = availableTests[testName]
                const test = new TestClass()

                await test.initialize()

                await test.execute()

                results[testName] = { success: true }
                console.log(`=== Test ${testName} completed successfully ===\n`)
            } catch (error: unknown) {
                results[testName] = { success: false, error }
                console.error(
                    `=== Test ${testName} failed: ${(error as Error).message} ===\n`,
                )

                anyTestFailed = true

                /* take a screenshot on failure */
                try {
                    if (appiumManager.driver) {
                        const screenshot =
                            await appiumManager.driver.takeScreenshot()
                        const screenshotPath = path.join(
                            process.cwd(),
                            'screenshots',
                            `${testName}-failure-${Date.now()}.png`,
                        )

                        const dir = path.dirname(screenshotPath)
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true })
                        }

                        fs.writeFileSync(screenshotPath, screenshot, 'base64')
                        console.log(`Screenshot saved to: ${screenshotPath}`)
                    }
                } catch (screenshotError) {
                    console.error(
                        'Failed to capture screenshot:',
                        screenshotError,
                    )
                }
            }
        }

        console.log('\n=== Test Run Summary ===')
        for (const [testName, result] of Object.entries(results)) {
            console.log(`${testName}: ${result.success ? 'PASSED' : 'FAILED'}`)
            if (!result.success) {
                console.log(`  Error: ${(result.error as Error).message}`)
            }
        }

        const successCount = Object.values(results).filter(
            r => r.success,
        ).length
        console.log(`\n${successCount}/${validTestNames.length} tests passed.`)

        // If not all tests passed, we have failures
        if (successCount < validTestNames.length) {
            anyTestFailed = true
        }
    } catch (error) {
        console.error('Test run failed:', error)
        anyTestFailed = true
    } finally {
        try {
            await appiumManager.teardown()
        } catch (error) {
            console.error('Error during teardown:', error)
        }

        if (anyTestFailed) {
            console.error('\n❌ Tests failed')
            process.exit(1)
        } else {
            console.log('\n✅ All tests passed')
            process.exit(0)
        }
    }
}

// Handle the special 'all' case
function getAllTestNames(): string[] {
    return Object.keys(availableTests)
}

// Get test names from command line arguments
const testNames = process.argv.slice(2)

if (testNames.length === 0) {
    console.log(
        'No tests specified. Available tests:',
        Object.keys(availableTests).join(', '),
    )
    console.log('Usage: ts-node runner.ts [test1] [test2] ...')
    process.exit(1) // Exit with error if no tests specified
} else if (testNames.includes('all')) {
    runTests(getAllTestNames())
} else {
    runTests(testNames)
}

process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT. Shutting down gracefully...')
    try {
        await AppiumManager.getInstance().teardown()
    } catch (error) {
        console.error('Error during teardown after SIGINT:', error)
    }
    process.exit(2)
})
