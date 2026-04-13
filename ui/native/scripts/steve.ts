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
    port: number
    sessionId: string
    udid: string
}

type SteveCommand =
    | 'a11y'
    | 'help'
    | 'info'
    | 'launch'
    | 'open-url'
    | 'reset'
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

const DEFAULT_BUNDLE_ID = process.env.STEVE_BUNDLE_ID || 'org.fedi.alpha'
const REPO_ROOT = path.resolve(__dirname, '../../..')
const STEVE_CACHE_DIR = path.join(REPO_ROOT, '.cache/steve')
const STEVE_SESSION_STATE_PATH = path.join(STEVE_CACHE_DIR, 'session.json')
const APPIUM_PID_FILE = path.join(REPO_ROOT, 'ui/.appium/appium_pid.txt')

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

    await deleteCachedSessionIfPresent()
}

async function resetApp(options: CliOptions): Promise<void> {
    const device = resolveDevice(options)

    runXcrun(['simctl', 'terminate', device.udid, options.bundleId], true)
    runXcrun(['simctl', 'uninstall', device.udid, options.bundleId], true)

    if (options.appPath) {
        runXcrun(['simctl', 'install', device.udid, options.appPath])
    }

    await deleteCachedSessionIfPresent()
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
    if (options.deviceId) {
        const device = listSimulators().find(
            simulator => simulator.udid === options.deviceId,
        )

        if (!device) {
            throw new Error(`Unknown simulator UDID: ${options.deviceId}`)
        }

        if (device.state !== 'Booted' && options.autoBoot) {
            runXcrun(['simctl', 'boot', device.udid], true)
            waitForBootedDevice(device.udid)
            return {
                ...device,
                state: 'Booted',
            }
        }

        return device
    }

    let device = listSimulators().find(
        simulator => simulator.state === 'Booted',
    )
    if (device) {
        return device
    }

    if (!options.autoBoot) {
        throw new Error('No booted iOS simulator found')
    }

    ensureSimulatorBooted()
    device = listSimulators().find(simulator => simulator.state === 'Booted')
    if (!device) {
        throw new Error('Failed to boot an iOS simulator')
    }

    return device
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
    const device = resolveDevice(options)
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
    const cachedState = loadCachedSession()
    let session: AppiumSession

    if (
        cachedState &&
        cachedState.port === port &&
        cachedState.udid === device.udid &&
        cachedState.bundleId === options.bundleId &&
        cachedState.headless === options.headless
    ) {
        session = { sessionId: cachedState.sessionId }
        const isReusable = await isSessionReusable(client, session)

        if (!isReusable) {
            clearCachedSession()
            session = await createAndCacheSession(client, options, device, port)
        }
    } else {
        if (cachedState) {
            await deleteCachedSessionIfPresent()
        }
        session = await createAndCacheSession(client, options, device, port)
    }

    try {
        return await fn(createSessionClient(client, session))
    } catch (error) {
        if (isInvalidSessionError(error)) {
            clearCachedSession()
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
    port: number,
): Promise<AppiumSession> {
    const session = await client.createSession({
        'appium:automationName': 'XCUITest',
        'appium:autoAcceptAlerts': true,
        'appium:bundleId': options.bundleId,
        'appium:isHeadless': options.headless,
        'appium:includeSafariInWebviews': true,
        'appium:platformName': 'iOS',
        'appium:udid': device.udid,
        ...(options.appPath ? { 'appium:app': options.appPath } : {}),
    })

    saveCachedSession({
        bundleId: options.bundleId,
        headless: options.headless,
        port,
        sessionId: session.sessionId,
        udid: device.udid,
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

function loadCachedSession(): CachedSessionState | undefined {
    try {
        if (!fs.existsSync(STEVE_SESSION_STATE_PATH)) {
            return undefined
        }

        const raw = fs.readFileSync(STEVE_SESSION_STATE_PATH, 'utf8')
        const parsed = JSON.parse(raw) as Partial<CachedSessionState>

        if (
            typeof parsed.sessionId !== 'string' ||
            typeof parsed.port !== 'number' ||
            typeof parsed.udid !== 'string' ||
            typeof parsed.bundleId !== 'string' ||
            typeof parsed.headless !== 'boolean'
        ) {
            return undefined
        }

        return parsed as CachedSessionState
    } catch {
        return undefined
    }
}

function saveCachedSession(state: CachedSessionState): void {
    fs.mkdirSync(STEVE_CACHE_DIR, { recursive: true })
    fs.writeFileSync(STEVE_SESSION_STATE_PATH, JSON.stringify(state, null, 2))
}

function clearCachedSession(): void {
    try {
        fs.rmSync(STEVE_SESSION_STATE_PATH, { force: true })
    } catch {
        return
    }
}

async function deleteCachedSessionIfPresent(): Promise<void> {
    const cachedState = loadCachedSession()
    if (!cachedState) {
        return
    }

    try {
        const client = createAppiumClient(cachedState.port)
        await client.deleteSession(cachedState.sessionId)
    } catch {
        // Ignore stale sessions; they are common after simulator/app restarts.
    } finally {
        clearCachedSession()
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
