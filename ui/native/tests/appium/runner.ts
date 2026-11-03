/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import AppiumManager from '../configs/appium/AppiumManager'
import { AppiumTestBase } from '../configs/appium/AppiumTestBase'
import { currentPlatform } from '../configs/appium/types'
import { readAppLog } from './common/appLogs'
import { setupOnboarded } from './fixtures/setupOnboarded'
import { Fixture } from './fixtures/types'
import {
    ACTOR_HANDLES,
    TestName,
    availableTests,
    resolveTestNames,
} from './registry'

const fixtures: Record<string, Fixture> = {
    [setupOnboarded.produces]: setupOnboarded,
}

// resetAppToFresh wipes the app sandbox, so pull the logs before the
// post-failure reset runs.
function captureAppLogs(testName: string) {
    const outDir = path.join(process.cwd(), '.appium')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    for (const h of AppiumManager.activeHandles()) {
        for (const label of ['bridge', 'ui'] as const) {
            const outPath = path.join(
                outDir,
                `${testName}-failure-${label}-${h}.log`,
            )
            try {
                const out = readAppLog(h, label)
                if (!out) continue
                fs.writeFileSync(outPath, out)
                console.log(`Device ${label} log saved to: ${outPath}`)
            } catch (logError) {
                console.error(
                    `Failed to capture ${label} log for actor "${h}":`,
                    logError,
                )
            }
        }
    }
}

function fmtDuration(ms: number): string {
    const s = Math.round(ms / 1000)
    return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

// Mutated by ensureState as fixtures run; cleared on test failure (state untrusted).
const currentState = new Set<string>()

function resolvePlan(
    needed: readonly string[],
    have: ReadonlySet<string>,
): Fixture[] {
    const plan: Fixture[] = []
    const visiting = new Set<string>()
    const planned = new Set<string>()

    function visit(state: string): void {
        if (have.has(state) || planned.has(state)) return
        if (visiting.has(state)) {
            throw new Error(`Cyclic fixture dependency at "${state}"`)
        }
        const fixture = fixtures[state]
        if (!fixture) {
            throw new Error(
                `No fixture produces state "${state}" — add one to fixtures or remove the prerequisite`,
            )
        }
        visiting.add(state)
        for (const req of fixture.requires) visit(req)
        visiting.delete(state)
        planned.add(state)
        plan.push(fixture)
    }

    for (const state of needed) visit(state)
    return plan
}

async function ensureState(
    test: AppiumTestBase,
    needed: readonly string[],
): Promise<void> {
    const neededSet = new Set(needed)
    const extra = [...currentState].filter(t => !neededSet.has(t))

    if (extra.length > 0) {
        console.log(
            `State has [${extra.join(', ')}] beyond what test requires — resetting`,
        )
        await test.resetAppToFresh()
        currentState.clear()
    }

    const plan = resolvePlan(needed, currentState)
    for (const fixture of plan) {
        const t0 = Date.now()
        await fixture.run(test)
        console.log(
            `Fixture ${fixture.produces} ran in ${fmtDuration(Date.now() - t0)}`,
        )
        currentState.add(fixture.produces)
    }
}

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
    let anyTestFailed = false
    try {
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

        const results: Record<
            string,
            {
                success: boolean
                error?: unknown
                skipped?: boolean
                durationMs?: number
            }
        > = {}

        for (const testName of validTestNames) {
            console.log(`\n=== Starting test: ${testName} ===`)

            const TestClass = availableTests[testName]
            const supported = TestClass.supportedPlatforms
            if (supported && !supported.includes(currentPlatform)) {
                console.log(
                    `=== Test ${testName} SKIPPED on ${currentPlatform} (supports: ${supported.join(', ')}) ===\n`,
                )
                results[testName] = { success: true, skipped: true }
                continue
            }

            const needed = TestClass.actors ?? 1
            if (needed > ACTOR_HANDLES.length) {
                throw new Error(
                    `Test ${testName} declares ${needed} actors but the runner only knows ${ACTOR_HANDLES.length} handles. Add more to ACTOR_HANDLES + AppiumManager.HANDLE_INDEX.`,
                )
            }
            const missingActor = ACTOR_HANDLES.slice(0, needed).find(
                h => !AppiumManager.actorConfigured(h),
            )
            if (missingActor) {
                const error = new Error(
                    `Actor "${missingActor}" not configured (needs DEVICE_ID_${missingActor.toUpperCase()} or AVD_${missingActor.toUpperCase()})`,
                )
                console.error(
                    `=== Test ${testName} FAILED: ${error.message} ===\n`,
                )
                results[testName] = { success: false, error }
                anyTestFailed = true
                continue
            }

            const test = new TestClass()
            const testStart = Date.now()

            try {
                await test.initialize()
                await ensureState(test, TestClass.prerequisites)
                await test.execute()

                for (const state of TestClass.produces) {
                    currentState.add(state)
                }

                const durationMs = Date.now() - testStart
                results[testName] = { success: true, durationMs }
                console.log(
                    `=== Test ${testName} completed successfully in ${fmtDuration(durationMs)} ===\n`,
                )
            } catch (error: unknown) {
                const durationMs = Date.now() - testStart
                results[testName] = { success: false, error, durationMs }
                console.error(
                    `=== Test ${testName} failed after ${fmtDuration(durationMs)}: ${(error as Error).message} ===\n`,
                )

                anyTestFailed = true

                // Capture both sides of a multi-device failure.
                for (const h of AppiumManager.activeHandles()) {
                    const drv = AppiumManager.getDriver(h)
                    if (!drv) continue
                    try {
                        const screenshot = await drv.takeScreenshot()
                        const screenshotPath = path.join(
                            process.cwd(),
                            'screenshots',
                            `${testName}-failure-${h}-${Date.now()}.png`,
                        )

                        const dir = path.dirname(screenshotPath)
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true })
                        }

                        fs.writeFileSync(screenshotPath, screenshot, 'base64')
                        console.log(`Screenshot saved to: ${screenshotPath}`)
                        const pageSource = await drv.getPageSource()
                        const xmlPath = path.join(
                            process.cwd(),
                            'screenshots',
                            `${testName}-failure-${h}-${Date.now()}.xml`,
                        )
                        fs.writeFileSync(xmlPath, pageSource)
                        console.log(`Page source saved to: ${xmlPath}`)
                    } catch (screenshotError) {
                        console.error(
                            `Failed to capture screenshot for actor "${h}":`,
                            screenshotError,
                        )
                    }
                }

                captureAppLogs(testName)

                // Device state untrusted after failure: reset primary,
                // tear down spawned actors.
                for (const h of AppiumManager.activeHandles()) {
                    const drv = AppiumManager.getDriver(h)
                    if (!drv) continue
                    try {
                        if (h === test.handle) {
                            await test.resetAppToFresh()
                        } else {
                            await AppiumManager.teardownSession(h)
                        }
                    } catch (resetError) {
                        console.error(
                            `Reset/teardown after failure failed for actor "${h}". Subsequent tests may not run cleanly:`,
                            resetError,
                        )
                    }
                }
                currentState.clear()
            }

            for (const h of AppiumManager.activeHandles()) {
                if (h !== test.handle) {
                    await AppiumManager.teardownSession(h)
                }
            }
        }

        console.log('\n=== Test Run Summary ===')
        for (const [testName, result] of Object.entries(results)) {
            const status = result.skipped
                ? 'SKIPPED'
                : result.success
                  ? 'PASSED'
                  : 'FAILED'
            const duration =
                result.durationMs === undefined
                    ? ''
                    : ` (${fmtDuration(result.durationMs)})`
            console.log(`${testName}: ${status}${duration}`)
            if (!result.success && !result.skipped) {
                console.log(`  Error: ${(result.error as Error).message}`)
            }
        }

        const successCount = Object.values(results).filter(
            r => r.success && !r.skipped,
        ).length
        const skippedCount = Object.values(results).filter(
            r => r.skipped,
        ).length
        const failedCount = validTestNames.length - successCount - skippedCount
        console.log(
            `\n${successCount} passed, ${failedCount} failed, ${skippedCount} skipped (${validTestNames.length} selected).`,
        )
        if (failedCount > 0 || successCount === 0) {
            anyTestFailed = true
        }
    } catch (error) {
        console.error('Test run failed:', error)
        anyTestFailed = true
    } finally {
        try {
            await AppiumManager.teardownAll()
        } catch (error) {
            console.error('Error during teardown:', error)
        }

        if (anyTestFailed) {
            console.error('\n❌ Tests failed')
            process.exit(1)
        } else {
            console.log('\n✅ All executed tests passed')
            process.exit(0)
        }
    }
}

const testNames = process.argv.slice(2)
if (testNames.length === 0) {
    console.log(
        'No tests specified. Available tests:',
        Object.keys(availableTests).join(', '),
    )
    console.log('Usage: ts-node runner.ts [test1] [test2] ...')
    process.exit(1)
} else {
    runTests(resolveTestNames(testNames))
}

process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT. Shutting down gracefully...')
    try {
        await AppiumManager.teardownAll()
    } catch (error) {
        console.error('Error during teardown after SIGINT:', error)
    }
    process.exit(2)
})
