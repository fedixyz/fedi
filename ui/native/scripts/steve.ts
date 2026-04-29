/* eslint-disable no-console */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
    findNodeByExactText,
    formatNormalizedA11yTree,
    getTapPoint,
    normalizeAppiumPageSource,
} from './steve/a11y'

interface AppiumSession {
    sessionId: string
}

interface AppiumClient {
    createSession(capabilities: Record<string, unknown>): Promise<AppiumSession>
    deleteSession(sessionId: string): Promise<void>
    getActiveElementId(sessionId: string): Promise<string>
    getPageSource(sessionId: string): Promise<string>
    takeScreenshot(sessionId: string): Promise<string>
    setElementValue(
        sessionId: string,
        elementId: string,
        text: string,
    ): Promise<void>
    performActions(sessionId: string, actions: unknown[]): Promise<void>
    releaseActions(sessionId: string): Promise<void>
}

interface AppiumSessionClient extends AppiumSession {
    getActiveElementId(): Promise<string>
    getPageSource(): Promise<string>
    takeScreenshot(): Promise<string>
    setElementValue(elementId: string, text: string): Promise<void>
    performActions(actions: unknown[]): Promise<void>
    releaseActions(): Promise<void>
}

interface CachedSessionState {
    bundleId: string
    headless: boolean
    mjpegServerPort: number
    port: number
    sessionId: string
    udid: string
    wdaLocalPort: number
}

interface CachedSessionEntry {
    path: string
    state: CachedSessionState
}

interface SessionCacheKey {
    bundleId: string
    headless: boolean
    mjpegServerPort: number
    port: number
    udid: string
    wdaLocalPort: number
}

interface SessionPorts {
    mjpegServerPort: number
    wdaLocalPort: number
}

type SteveCommand =
    | 'a11y'
    | 'help'
    | 'info'
    | 'launch'
    | 'open-url'
    | 'reset'
    | 'restart'
    | 'screens'
    | 'screenshot'
    | 'stop'
    | 'swipe'
    | 'tap'
    | 'type'
    | 'wait-for-idle'

interface CliOptions {
    appPath?: string
    autoBoot: boolean
    bundleId: string
    command: SteveCommand
    commandArgs: string[]
    deviceId?: string
    headless: boolean
    noWait: boolean
}

interface SimDevice {
    availabilityError?: string
    dataPath?: string
    deviceTypeIdentifier?: string
    isAvailable?: boolean
    lastBootedAt?: string
    logPath?: string
    name: string
    runtime: string
    state: string
    udid: string
}

interface ResolvedDevice {
    device: SimDevice
    simulators: SimDevice[]
}

const DEFAULT_BUNDLE_ID = process.env.STEVE_BUNDLE_ID || 'org.fedi.alpha'
const REPO_ROOT = path.resolve(__dirname, '../../..')
const STEVE_CACHE_DIR = path.join(REPO_ROOT, '.cache/steve')
const STEVE_SESSION_STATE_DIR = path.join(STEVE_CACHE_DIR, 'sessions')
const STEVE_LEGACY_SESSION_STATE_PATH = path.join(
    STEVE_CACHE_DIR,
    'session.json',
)
const STEVE_DERIVED_DATA_DIR = path.join(STEVE_CACHE_DIR, 'derived-data')
const APPIUM_PID_FILE = path.join(REPO_ROOT, 'ui/.appium/appium_pid.txt')
const WDA_LOCAL_PORT_BASE = 8100
const MJPEG_SERVER_PORT_BASE = 9100
const PARALLEL_PORT_RANGE = 1000

async function main(): Promise<void> {
    const options = parseCli(process.argv.slice(2))

    switch (options.command) {
        case 'help':
            printUsage()
            return
        case 'screens':
            printScreens()
            return
        case 'info':
            printInfo(options)
            return
        case 'launch':
            launchApp(options)
            return
        case 'restart':
            restartApp(options)
            return
        case 'stop':
            await stopApp(options)
            return
        case 'reset':
            await resetApp(options)
            return
        case 'open-url':
            openUrl(options)
            return
        case 'wait-for-idle':
            await withAppiumSession(options, async client => {
                const waitedMs = options.noWait ? 0 : await waitForIdle(client)
                console.log(`idle after ${waitedMs}ms`)
            })
            return
        case 'screenshot':
            await saveScreenshot(options)
            return
        case 'a11y':
            await printA11y(options)
            return
        case 'tap':
            await tap(options)
            return
        case 'swipe':
            await swipe(options)
            return
        case 'type':
            await typeText(options)
            return
        default:
            throw new Error(`Unsupported command: ${options.command}`)
    }
}

function parseCli(argv: string[]): CliOptions {
    let deviceId = process.env.STEVE_DEVICE_ID || process.env.DEVICE_ID
    let bundleId = process.env.STEVE_BUNDLE_ID || process.env.BUNDLE_ID
    let appPath = process.env.STEVE_APP_PATH || process.env.BUNDLE_PATH
    let headless = process.env.STEVE_HEADLESS === '1'
    let noWait = false
    let autoBoot = true

    let index = 0
    while (index < argv.length && argv[index].startsWith('--')) {
        const flag = argv[index]
        const value = argv[index + 1]

        switch (flag) {
            case '--device':
                if (!value) {
                    throw new Error('--device requires a UDID')
                }
                deviceId = value
                index += 2
                break
            case '--bundle':
                if (!value) {
                    throw new Error('--bundle requires a bundle ID')
                }
                bundleId = value
                index += 2
                break
            case '--app':
                if (!value) {
                    throw new Error('--app requires an .app path')
                }
                appPath = value
                index += 2
                break
            case '--headless':
                headless = true
                index += 1
                break
            case '--no-wait':
                noWait = true
                index += 1
                break
            case '--no-boot':
                autoBoot = false
                index += 1
                break
            case '--help':
                return {
                    autoBoot,
                    bundleId: bundleId || DEFAULT_BUNDLE_ID,
                    command: 'help',
                    commandArgs: [],
                    deviceId,
                    headless,
                    noWait,
                    appPath,
                }
            default:
                throw new Error(`Unknown flag: ${flag}`)
        }
    }

    const command = (argv[index] || 'help') as SteveCommand
    const commandArgs = argv.slice(index + 1)

    return {
        appPath,
        autoBoot,
        bundleId: bundleId || DEFAULT_BUNDLE_ID,
        command,
        commandArgs,
        deviceId,
        headless,
        noWait,
    }
}

function printUsage(): void {
    console.log(`Usage: steve [--device <udid>] [--bundle <bundleId>] [--app <path>] [--headless] [--no-wait] <command> [args]

Commands:
  screens                     list available iOS simulators
  info                        print selected simulator info as JSON
  launch                      launch the configured bundle ID
  restart                     terminate and relaunch without clearing Appium session
  stop                        terminate the configured bundle ID
  reset                       uninstall the configured bundle ID, reinstall if --app is provided
  open-url <url>              open a URL in the simulator
  wait-for-idle               wait until the page source is stable
  screenshot [path]           save an app screenshot to a path
  a11y                        print a normalized accessibility tree
  tap <text|x,y>              tap by exact accessibility text or coordinates
  swipe <x1> <y1> <x2> <y2> [duration_ms]
  type <text>                 type into the currently focused element

Environment defaults:
  STEVE_DEVICE_ID / DEVICE_ID
  STEVE_BUNDLE_ID / BUNDLE_ID
  STEVE_HEADLESS (set to 1 for headless Appium sessions)
  STEVE_APP_PATH / BUNDLE_PATH`)
}

function printScreens(): void {
    const devices = listSimulators()

    devices.forEach(device => {
        const status = device.state === 'Booted' ? 'booted' : 'available'
        console.log(`${device.name} ${device.udid} ${status} ${device.runtime}`)
    })
}

function printInfo(options: CliOptions): void {
    const device = resolveDevice(options)
    console.log(
        JSON.stringify(
            {
                bundleId: options.bundleId,
                deviceTypeIdentifier: device.deviceTypeIdentifier,
                name: device.name,
                runtime: device.runtime,
                state: device.state,
                udid: device.udid,
            },
            null,
            2,
        ),
    )
}

function launchApp(options: CliOptions): void {
    const device = resolveDevice(options)

    if (options.appPath) {
        runXcrun(['simctl', 'install', device.udid, options.appPath])
    }

    const result = runXcrun(['simctl', 'launch', device.udid, options.bundleId])
    process.stdout.write(result)
}

function restartApp(options: CliOptions): void {
    const device = resolveDevice(options)

    runXcrun(['simctl', 'terminate', device.udid, options.bundleId], true)

    const result = runXcrun(['simctl', 'launch', device.udid, options.bundleId])
    process.stdout.write(result)
}

async function stopApp(options: CliOptions): Promise<void> {
    const device = resolveDevice(options)
    const result = runXcrun([
        'simctl',
        'terminate',
        device.udid,
        options.bundleId,
    ])
    if (result.trim().length > 0) {
        process.stdout.write(result)
    }

    await deleteCachedSessionsForDevice(device, options.bundleId)
}

async function resetApp(options: CliOptions): Promise<void> {
    const device = resolveDevice(options)

    runXcrun(['simctl', 'terminate', device.udid, options.bundleId], true)
    runXcrun(['simctl', 'uninstall', device.udid, options.bundleId], true)

    if (options.appPath) {
        runXcrun(['simctl', 'install', device.udid, options.appPath])
    }

    await deleteCachedSessionsForDevice(device, options.bundleId)
}

function openUrl(options: CliOptions): void {
    const url = options.commandArgs[0]
    if (!url) {
        throw new Error('open-url requires a URL')
    }

    const device = resolveDevice(options)
    runXcrun(['simctl', 'openurl', device.udid, url])
}

async function saveScreenshot(options: CliOptions): Promise<void> {
    const outputPath =
        options.commandArgs[0] ||
        path.join(os.tmpdir(), `steve-${Date.now()}.png`)

    await withAppiumSession(options, async client => {
        if (!options.noWait) {
            const waitedMs = await waitForIdle(client)
            console.log(`note: waited ${waitedMs}ms for idle`)
        }

        const screenshot = await client.takeScreenshot()
        fs.writeFileSync(outputPath, screenshot, 'base64')
        console.log(outputPath)
    })
}

async function printA11y(options: CliOptions): Promise<void> {
    await withAppiumSession(options, async client => {
        if (!options.noWait) {
            const waitedMs = await waitForIdle(client)
            console.log(`note: waited ${waitedMs}ms for idle`)
        }

        const pageSource = await client.getPageSource()
        const tree = normalizeAppiumPageSource(pageSource)
        const formatted = formatNormalizedA11yTree(tree)
        console.log(formatted)
    })
}

async function tap(options: CliOptions): Promise<void> {
    const target = options.commandArgs[0]
    if (!target) {
        throw new Error('tap requires either "text" or x,y')
    }

    await withAppiumSession(options, async client => {
        const coordinates = parseCoordinatePair(target)

        if (coordinates) {
            await performTap(client, coordinates.x, coordinates.y)
            return
        }

        if (!options.noWait) {
            const waitedMs = await waitForIdle(client)
            console.log(`note: waited ${waitedMs}ms for idle`)
        }

        const pageSource = await client.getPageSource()
        const tree = normalizeAppiumPageSource(pageSource)
        const node = findNodeByExactText(tree, target)

        if (!node) {
            throw new Error(`No visible accessibility node matched "${target}"`)
        }

        const tapPoint = getTapPoint(node)
        if (!tapPoint) {
            throw new Error(`Matched node for "${target}" has no bounds`)
        }

        await performTap(client, tapPoint.x, tapPoint.y)
    })
}

async function swipe(options: CliOptions): Promise<void> {
    const [startX, startY, endX, endY, durationValue] = options.commandArgs
    if (!startX || !startY || !endX || !endY) {
        throw new Error('swipe requires x1 y1 x2 y2 [duration_ms]')
    }

    const duration = durationValue ? Number(durationValue) : 300
    await withAppiumSession(options, async client => {
        await performSwipe(
            client,
            Number(startX),
            Number(startY),
            Number(endX),
            Number(endY),
            duration,
        )
    })
}

async function typeText(options: CliOptions): Promise<void> {
    const text = options.commandArgs.join(' ')
    if (text.length === 0) {
        throw new Error('type requires text')
    }

    await withAppiumSession(options, async client => {
        const activeElementId = await client.getActiveElementId()
        await client.setElementValue(activeElementId, text)
    })
}

function listSimulators(): SimDevice[] {
    const result = runXcrun(['simctl', 'list', 'devices', '--json'])
    const parsed = JSON.parse(result) as {
        devices: Record<string, Array<Record<string, unknown>>>
    }

    return Object.entries(parsed.devices)
        .flatMap(([runtime, devices]) =>
            devices.map(device => ({
                availabilityError:
                    typeof device.availabilityError === 'string'
                        ? device.availabilityError
                        : undefined,
                dataPath:
                    typeof device.dataPath === 'string'
                        ? device.dataPath
                        : undefined,
                deviceTypeIdentifier:
                    typeof device.deviceTypeIdentifier === 'string'
                        ? device.deviceTypeIdentifier
                        : undefined,
                isAvailable:
                    typeof device.isAvailable === 'boolean'
                        ? device.isAvailable
                        : true,
                lastBootedAt:
                    typeof device.lastBootedAt === 'string'
                        ? device.lastBootedAt
                        : undefined,
                logPath:
                    typeof device.logPath === 'string'
                        ? device.logPath
                        : undefined,
                name: String(device.name),
                runtime,
                state: String(device.state),
                udid: String(device.udid),
            })),
        )
        .filter(device => device.isAvailable !== false)
}

function resolveDevice(options: CliOptions): SimDevice {
    return resolveDeviceWithSimulators(options).device
}

function resolveDeviceWithSimulators(options: CliOptions): ResolvedDevice {
    let simulators = listSimulators()

    if (options.deviceId) {
        const device = simulators.find(
            simulator => simulator.udid === options.deviceId,
        )

        if (!device) {
            throw new Error(`Unknown simulator UDID: ${options.deviceId}`)
        }

        if (device.state !== 'Booted' && options.autoBoot) {
            runXcrun(['simctl', 'boot', device.udid], true)
            waitForBootedDevice(device.udid)
            const bootedDevice = {
                ...device,
                state: 'Booted',
            }

            return {
                device: bootedDevice,
                simulators: simulators.map(simulator =>
                    simulator.udid === bootedDevice.udid
                        ? bootedDevice
                        : simulator,
                ),
            }
        }

        return { device, simulators }
    }

    let device = simulators.find(simulator => simulator.state === 'Booted')
    if (device) {
        return { device, simulators }
    }

    if (!options.autoBoot) {
        throw new Error('No booted iOS simulator found')
    }

    ensureSimulatorBooted()
    simulators = listSimulators()
    device = simulators.find(simulator => simulator.state === 'Booted')
    if (!device) {
        throw new Error('Failed to boot an iOS simulator')
    }

    return { device, simulators }
}

function ensureSimulatorBooted(): void {
    runScript(path.join(REPO_ROOT, 'scripts/ui/start-ios-simulators.sh'))
}

function waitForBootedDevice(udid: string): void {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const device = listSimulators().find(
            simulator => simulator.udid === udid,
        )
        if (device?.state === 'Booted') {
            return
        }

        execFileSync('sleep', ['1'])
    }

    throw new Error(`Timed out waiting for simulator ${udid} to boot`)
}

function ensureAppiumServer(): void {
    runScript(path.join(REPO_ROOT, 'scripts/ui/setup-and-start-appium.sh'))
}

async function withAppiumSession<T>(
    options: CliOptions,
    fn: (client: AppiumSessionClient) => Promise<T>,
): Promise<T> {
    const { device, simulators } = resolveDeviceWithSimulators(options)
    ensureAppiumServer()
    const port = detectAppiumPort()

    process.env.PLATFORM = 'ios'
    process.env.DEVICE_ID = device.udid
    process.env.BUNDLE_ID = options.bundleId

    if (options.appPath) {
        process.env.BUNDLE_PATH = options.appPath
    } else {
        delete process.env.BUNDLE_PATH
    }

    const client = createAppiumClient(port)
    const cacheKey = getSessionCacheKey(options, device, port, simulators)
    const cachePath = getSessionCachePath(cacheKey)
    await deleteLegacyCachedSessionIfPresent()
    const cachedState = loadCachedSession(cachePath)
    let session: AppiumSession

    if (cachedState && isCachedSessionMatch(cachedState, cacheKey)) {
        session = { sessionId: cachedState.sessionId }
        const isReusable = await isSessionReusable(client, session)

        if (!isReusable) {
            clearCachedSession(cachePath)
            session = await createAndCacheSession(
                client,
                options,
                device,
                cacheKey,
                cachePath,
            )
        }
    } else {
        if (cachedState) {
            await deleteCachedSession(cachedState, cachePath)
        }
        session = await createAndCacheSession(
            client,
            options,
            device,
            cacheKey,
            cachePath,
        )
    }

    try {
        return await fn(createSessionClient(client, session))
    } catch (error) {
        if (isInvalidSessionError(error)) {
            clearCachedSession(cachePath)
        }
        throw error
    }
}

async function waitForIdle(
    client: AppiumSessionClient,
    timeoutMs = 5000,
    intervalMs = 250,
): Promise<number> {
    const startedAt = Date.now()
    let stableIterations = 0
    let previousSource = ''

    while (Date.now() - startedAt < timeoutMs) {
        const pageSource = await client.getPageSource()

        if (pageSource === previousSource) {
            stableIterations += 1
            if (stableIterations >= 2) {
                return Date.now() - startedAt
            }
        } else {
            previousSource = pageSource
            stableIterations = 0
        }

        await sleep(intervalMs)
    }

    return Date.now() - startedAt
}

async function performTap(
    client: AppiumSessionClient,
    x: number,
    y: number,
): Promise<void> {
    await client.performActions([
        {
            actions: [
                {
                    duration: 0,
                    type: 'pointerMove',
                    x,
                    y,
                },
                {
                    button: 0,
                    type: 'pointerDown',
                },
                {
                    duration: 75,
                    type: 'pause',
                },
                {
                    button: 0,
                    type: 'pointerUp',
                },
            ],
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            type: 'pointer',
        },
    ])
    await client.releaseActions()
}

async function performSwipe(
    client: AppiumSessionClient,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number,
): Promise<void> {
    await client.performActions([
        {
            actions: [
                {
                    duration: 0,
                    type: 'pointerMove',
                    x: startX,
                    y: startY,
                },
                {
                    button: 0,
                    type: 'pointerDown',
                },
                {
                    duration,
                    type: 'pointerMove',
                    x: endX,
                    y: endY,
                },
                {
                    button: 0,
                    type: 'pointerUp',
                },
            ],
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            type: 'pointer',
        },
    ])
    await client.releaseActions()
}

function createAppiumClient(port: number): AppiumClient {
    const baseUrl = `http://127.0.0.1:${port}`

    const request = async <T>(
        method: string,
        pathname: string,
        body?: unknown,
    ): Promise<T> => {
        const response = await fetch(`${baseUrl}${pathname}`, {
            body: body === undefined ? undefined : JSON.stringify(body),
            headers:
                body === undefined
                    ? undefined
                    : {
                          'Content-Type': 'application/json',
                      },
            method,
        })

        const text = await response.text()
        const parsed = text.length > 0 ? JSON.parse(text) : {}

        if (!response.ok) {
            const message =
                parsed?.value?.message ||
                parsed?.message ||
                `${method} ${pathname} failed with ${response.status}`
            throw new Error(message)
        }

        return parsed?.value as T
    }

    return {
        async createSession(
            capabilities: Record<string, unknown>,
        ): Promise<AppiumSession> {
            const response = await fetch(`${baseUrl}/session`, {
                body: JSON.stringify({
                    capabilities: {
                        alwaysMatch: capabilities,
                        firstMatch: [{}],
                    },
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
                method: 'POST',
            })
            const payload = await response.json()

            if (!response.ok) {
                throw new Error(
                    payload?.value?.message ||
                        payload?.message ||
                        `Failed to create Appium session on port ${port}`,
                )
            }

            return {
                sessionId:
                    payload?.value?.sessionId || payload?.sessionId || '',
            }
        },

        async deleteSession(sessionId: string): Promise<void> {
            await request('DELETE', `/session/${sessionId}`)
        },

        async getActiveElementId(sessionId: string): Promise<string> {
            const value = await request<Record<string, string>>(
                'GET',
                `/session/${sessionId}/element/active`,
            )
            return value['element-6066-11e4-a52e-4f735466cecf'] || value.ELEMENT
        },

        async getPageSource(sessionId: string): Promise<string> {
            return request('GET', `/session/${sessionId}/source`)
        },

        async takeScreenshot(sessionId: string): Promise<string> {
            return request('GET', `/session/${sessionId}/screenshot`)
        },

        async setElementValue(
            sessionId: string,
            elementId: string,
            text: string,
        ): Promise<void> {
            await request(
                'POST',
                `/session/${sessionId}/element/${elementId}/value`,
                {
                    text,
                },
            )
        },

        async performActions(
            sessionId: string,
            actions: unknown[],
        ): Promise<void> {
            await request('POST', `/session/${sessionId}/actions`, {
                actions,
            })
        },

        async releaseActions(sessionId: string): Promise<void> {
            await request('DELETE', `/session/${sessionId}/actions`)
        },
    }
}

function createSessionClient(
    client: AppiumClient,
    session: AppiumSession,
): AppiumSessionClient {
    return {
        ...session,
        getActiveElementId: () => client.getActiveElementId(session.sessionId),
        getPageSource: () => client.getPageSource(session.sessionId),
        performActions: actions =>
            client.performActions(session.sessionId, actions),
        releaseActions: () => client.releaseActions(session.sessionId),
        setElementValue: (elementId, text) =>
            client.setElementValue(session.sessionId, elementId, text),
        takeScreenshot: () => client.takeScreenshot(session.sessionId),
    }
}

async function createAndCacheSession(
    client: AppiumClient,
    options: CliOptions,
    device: SimDevice,
    cacheKey: SessionCacheKey,
    cachePath: string,
): Promise<AppiumSession> {
    const session = await client.createSession({
        'appium:automationName': 'XCUITest',
        'appium:autoAcceptAlerts': true,
        'appium:bundleId': options.bundleId,
        'appium:derivedDataPath': getDerivedDataPath(device.udid),
        'appium:isHeadless': options.headless,
        'appium:includeSafariInWebviews': true,
        'appium:mjpegServerPort': cacheKey.mjpegServerPort,
        'appium:platformName': 'iOS',
        'appium:udid': device.udid,
        'appium:wdaLocalPort': cacheKey.wdaLocalPort,
        ...(options.appPath ? { 'appium:app': options.appPath } : {}),
    })

    saveCachedSession(cachePath, {
        bundleId: cacheKey.bundleId,
        headless: cacheKey.headless,
        mjpegServerPort: cacheKey.mjpegServerPort,
        port: cacheKey.port,
        sessionId: session.sessionId,
        udid: cacheKey.udid,
        wdaLocalPort: cacheKey.wdaLocalPort,
    })

    return session
}

async function isSessionReusable(
    client: AppiumClient,
    session: AppiumSession,
): Promise<boolean> {
    try {
        await client.getPageSource(session.sessionId)
        return true
    } catch (error) {
        if (isInvalidSessionError(error)) {
            return false
        }

        return true
    }
}

function parseCoordinatePair(
    value: string,
): { x: number; y: number } | undefined {
    const match = value.match(/^(-?\d+),(-?\d+)$/)
    if (!match) {
        return undefined
    }

    return {
        x: Number(match[1]),
        y: Number(match[2]),
    }
}

function runXcrun(args: string[], allowFailure = false): string {
    try {
        return execFileSync('xcrun', args, {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
    } catch (error) {
        if (allowFailure) {
            return ''
        }
        throw formatExecError(error)
    }
}

function runScript(scriptPath: string): void {
    try {
        execFileSync(scriptPath, [], {
            cwd: REPO_ROOT,
            stdio: 'inherit',
        })
    } catch (error) {
        throw formatExecError(error)
    }
}

function getSessionCacheKey(
    options: CliOptions,
    device: SimDevice,
    port: number,
    simulators: SimDevice[],
): SessionCacheKey {
    const sessionPorts = getSessionPorts(device.udid, simulators)

    return {
        bundleId: options.bundleId,
        headless: options.headless,
        mjpegServerPort: sessionPorts.mjpegServerPort,
        port,
        udid: device.udid,
        wdaLocalPort: sessionPorts.wdaLocalPort,
    }
}

function getSessionCachePath(key: SessionCacheKey): string {
    const mode = key.headless ? 'headless' : 'windowed'
    const fileName = [String(key.port), key.udid, key.bundleId, mode]
        .map(sanitizeCachePathPart)
        .join('--')

    return path.join(STEVE_SESSION_STATE_DIR, `${fileName}.json`)
}

function isCachedSessionMatch(
    state: CachedSessionState,
    key: SessionCacheKey,
): boolean {
    return (
        state.port === key.port &&
        state.udid === key.udid &&
        state.bundleId === key.bundleId &&
        state.headless === key.headless &&
        state.mjpegServerPort === key.mjpegServerPort &&
        state.wdaLocalPort === key.wdaLocalPort
    )
}

function getSessionPorts(udid: string, simulators: SimDevice[]): SessionPorts {
    const portOffset = getSimulatorPortOffset(udid, simulators)

    return {
        mjpegServerPort: MJPEG_SERVER_PORT_BASE + portOffset,
        wdaLocalPort: WDA_LOCAL_PORT_BASE + portOffset,
    }
}

function getSimulatorPortOffset(udid: string, simulators: SimDevice[]): number {
    const sortedUdids = simulators
        .map(device => device.udid)
        .sort((a, b) => a.localeCompare(b))
    const usedOffsets = new Set<number>()

    // Collision handling depends on the current simulator list. If that list
    // changes, a cached session may be recreated with newly assigned ports.
    for (const simulatorUdid of sortedUdids) {
        const offset = findAvailablePortOffset(simulatorUdid, usedOffsets)
        if (simulatorUdid === udid) {
            return offset
        }
    }

    throw new Error(
        `Could not allocate Appium ports for unknown simulator ${udid}`,
    )
}

function findAvailablePortOffset(
    udid: string,
    usedOffsets: Set<number>,
): number {
    const preferredOffset = stableHash(udid) % PARALLEL_PORT_RANGE

    for (let attempt = 0; attempt < PARALLEL_PORT_RANGE; attempt += 1) {
        const offset = (preferredOffset + attempt) % PARALLEL_PORT_RANGE
        if (!usedOffsets.has(offset)) {
            usedOffsets.add(offset)
            return offset
        }
    }

    throw new Error(
        `Could not allocate unique Appium ports for simulator ${udid}`,
    )
}

function getDerivedDataPath(udid: string): string {
    return path.join(STEVE_DERIVED_DATA_DIR, sanitizeCachePathPart(udid))
}

function listCachedSessionEntries(): CachedSessionEntry[] {
    const paths: string[] = []

    try {
        if (fs.existsSync(STEVE_SESSION_STATE_DIR)) {
            paths.push(
                ...fs
                    .readdirSync(STEVE_SESSION_STATE_DIR)
                    .filter(fileName => fileName.endsWith('.json'))
                    .map(fileName =>
                        path.join(STEVE_SESSION_STATE_DIR, fileName),
                    ),
            )
        }
    } catch {
        return []
    }

    return paths.flatMap(sessionPath => {
        const state = loadCachedSession(sessionPath)
        return state ? [{ path: sessionPath, state }] : []
    })
}

async function deleteLegacyCachedSessionIfPresent(): Promise<void> {
    const cachedState = loadLegacyCachedSession()
    if (!cachedState) {
        clearCachedSession(STEVE_LEGACY_SESSION_STATE_PATH)
        return
    }

    await deleteCachedSession(cachedState, STEVE_LEGACY_SESSION_STATE_PATH)
}

function stableHash(value: string): number {
    let hash = 0

    for (const char of value) {
        hash = (hash * 31 + char.charCodeAt(0)) % 4294967296
    }

    return hash
}

function sanitizeCachePathPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function loadLegacyCachedSession(): CachedSessionState | undefined {
    try {
        if (!fs.existsSync(STEVE_LEGACY_SESSION_STATE_PATH)) {
            return undefined
        }

        const raw = fs.readFileSync(STEVE_LEGACY_SESSION_STATE_PATH, 'utf8')
        const parsed = JSON.parse(raw) as Partial<CachedSessionState>

        if (
            typeof parsed.sessionId !== 'string' ||
            typeof parsed.port !== 'number'
        ) {
            return undefined
        }

        return {
            bundleId:
                typeof parsed.bundleId === 'string' ? parsed.bundleId : '',
            headless:
                typeof parsed.headless === 'boolean' ? parsed.headless : false,
            mjpegServerPort: 0,
            port: parsed.port,
            sessionId: parsed.sessionId,
            udid: typeof parsed.udid === 'string' ? parsed.udid : '',
            wdaLocalPort: 0,
        }
    } catch {
        return undefined
    }
}

function loadCachedSession(cachePath: string): CachedSessionState | undefined {
    try {
        if (!fs.existsSync(cachePath)) {
            return undefined
        }

        const raw = fs.readFileSync(cachePath, 'utf8')
        const parsed = JSON.parse(raw) as Partial<CachedSessionState>

        if (
            typeof parsed.sessionId !== 'string' ||
            typeof parsed.port !== 'number' ||
            typeof parsed.udid !== 'string' ||
            typeof parsed.bundleId !== 'string' ||
            typeof parsed.headless !== 'boolean' ||
            typeof parsed.mjpegServerPort !== 'number' ||
            typeof parsed.wdaLocalPort !== 'number'
        ) {
            return undefined
        }

        return parsed as CachedSessionState
    } catch {
        return undefined
    }
}

function saveCachedSession(cachePath: string, state: CachedSessionState): void {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })

    const tmpPath = `${cachePath}.${process.pid}.tmp`
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2))
        fs.renameSync(tmpPath, cachePath)
    } catch (error) {
        fs.rmSync(tmpPath, { force: true })
        throw error
    }
}

function clearCachedSession(cachePath: string): void {
    try {
        fs.rmSync(cachePath, { force: true })
    } catch {
        return
    }
}

async function deleteCachedSession(
    cachedState: CachedSessionState,
    cachePath: string,
): Promise<void> {
    try {
        const client = createAppiumClient(cachedState.port)
        await client.deleteSession(cachedState.sessionId)
    } catch {
        // Ignore stale sessions; they are common after simulator/app restarts.
    } finally {
        clearCachedSession(cachePath)
    }
}

async function deleteCachedSessionsForDevice(
    device: SimDevice,
    bundleId: string,
): Promise<void> {
    const entries = listCachedSessionEntries().filter(
        entry =>
            entry.state.udid === device.udid &&
            entry.state.bundleId === bundleId,
    )

    for (const entry of entries) {
        await deleteCachedSession(entry.state, entry.path)
    }
}

function detectAppiumPort(): number {
    const configuredPort = process.env.APPIUM_PORT
    if (configuredPort) {
        return Number(configuredPort)
    }

    const pids = [...loadAppiumPidFile(), ...listAppiumCandidatePids()].filter(
        (pid, index, values) => values.indexOf(pid) === index,
    )

    if (pids.length === 0) {
        throw new Error(
            'Appium server is not running. Start it in dev infra or set APPIUM_PORT.',
        )
    }

    for (const pid of pids) {
        try {
            const lsofOutput = execFileSync(
                'lsof',
                ['-Pan', '-p', pid, '-a', '-iTCP', '-sTCP:LISTEN'],
                {
                    cwd: REPO_ROOT,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            )

            const portMatch = lsofOutput.match(/:(\d+)\s+\(LISTEN\)/)
            if (portMatch) {
                return Number(portMatch[1])
            }
        } catch {
            continue
        }
    }

    throw new Error(
        `Could not determine a listening Appium port from PIDs: ${pids.join(', ')}`,
    )
}

function loadAppiumPidFile(): string[] {
    try {
        if (!fs.existsSync(APPIUM_PID_FILE)) {
            return []
        }

        const pid = fs.readFileSync(APPIUM_PID_FILE, 'utf8').trim()
        return pid ? [pid] : []
    } catch {
        return []
    }
}

function listAppiumCandidatePids(): string[] {
    let output = ''
    try {
        output = execFileSync('ps', ['-axo', 'pid=,comm=,args='], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
    } catch {
        return []
    }

    return output
        .trim()
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean)
        .map(line => {
            const match = line.match(/^(\d+)\s+(\S+)\s+(.*)$/)
            if (!match) {
                return undefined
            }

            return {
                args: match[3],
                comm: match[2],
                pid: match[1],
            }
        })
        .filter(
            (
                value,
            ): value is {
                args: string
                comm: string
                pid: string
            } => {
                if (!value) {
                    return false
                }

                return (
                    (value.comm === 'node' || value.comm === 'appium') &&
                    value.args.includes('appium') &&
                    !value.args.includes('appium-webdriveragent') &&
                    !value.args.includes('appium-xcuitest-driver')
                )
            },
        )
        .map(value => value.pid)
        .filter(Boolean)
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function isInvalidSessionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false
    }

    const message = error.message.toLowerCase()
    return (
        message.includes('invalid session id') ||
        message.includes('session does not exist') ||
        message.includes('does not have a valid active session') ||
        message.includes('session is either terminated or not started')
    )
}

function formatExecError(error: unknown): Error {
    if (
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        typeof (error as { stderr?: Buffer | string }).stderr !== 'undefined'
    ) {
        const stderr = (error as { stderr?: Buffer | string }).stderr
        const message = Buffer.isBuffer(stderr)
            ? stderr.toString('utf8').trim()
            : String(stderr).trim()

        return new Error(message || 'Command failed')
    }

    if (error instanceof Error) {
        return error
    }

    return new Error(String(error))
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
