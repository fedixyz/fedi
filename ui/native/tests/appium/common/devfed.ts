/* eslint-disable no-console */
import { execFileSync } from 'child_process'

import AppiumManager from '../../configs/appium/AppiumManager'
import { Platform, currentPlatform } from '../../configs/appium/types'

// The dev-fed's remote-server exposes invite + ecash over HTTP on the host
// loopback; the runner (a host node process) reads REMOTE_BRIDGE_PORT from env.
function devfedBaseUrl(): string {
    const port = process.env.REMOTE_BRIDGE_PORT
    if (!port) {
        throw new Error(
            'REMOTE_BRIDGE_PORT is unset; run under scripts/bridge/run-remote.sh --with-devfed',
        )
    }
    return `http://127.0.0.1:${port}`
}

// The fed is a freshly launched local process; the first funding calls can
// race a connection reset ("fetch failed") before it settles.
export async function fetchDevfedText(
    pathAndQuery: string,
    init?: RequestInit,
): Promise<string> {
    const url = `${devfedBaseUrl()}${pathAndQuery}`
    let lastErr: unknown
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const res = await fetch(url, init)
            const body = await res.text()
            if (!res.ok) {
                throw new Error(`${pathAndQuery} ${res.status}: ${body}`)
            }
            return body
        } catch (err) {
            lastErr = err
            if (attempt < 5) {
                await new Promise(r => setTimeout(r, attempt * 500))
            }
        }
    }
    throw new Error(
        `dev-fed ${init?.method ?? 'GET'} ${pathAndQuery} failed after 5 attempts: ${(lastErr as Error).message}`,
    )
}

// The fed binds every service to the host's loopback, which an android
// emulator cannot see (its 127.0.0.1 is the emulator itself). Map each fed
// port into the emulators with adb reverse so the app can dial the invite's
// addresses unmodified. iOS simulators share the host loopback and need
// nothing.
export async function reverseDevfedPortsIntoDevices(): Promise<void> {
    if (currentPlatform !== Platform.ANDROID) return
    const ports = await fetchDevfedPorts()
    for (const handle of AppiumManager.activeHandles()) {
        const udid = AppiumManager.deviceId(handle)
        if (!udid) continue
        for (const port of ports) {
            execFileSync('adb', [
                '-s',
                udid,
                'reverse',
                `tcp:${port}`,
                `tcp:${port}`,
            ])
        }
        console.log(`[devfed] reversed ${ports.length} fed ports into ${udid}`)
    }
}

export async function removeDevfedPortsFromDevice(
    handle: string,
): Promise<void> {
    const udid = AppiumManager.deviceId(handle)
    if (!udid) throw new Error(`no device id for actor ${handle}`)
    for (const port of await fetchDevfedPorts()) {
        execFileSync('adb', ['-s', udid, 'reverse', '--remove', `tcp:${port}`])
    }
    console.log(`[devfed] removed the fed ports from ${udid}`)
}

async function fetchDevfedPorts(): Promise<number[]> {
    const body = await fetchDevfedText('/ports')
    const ports: number[] = JSON.parse(body).ports
    if (!ports?.length) throw new Error(`ports response had no ports: ${body}`)
    return ports
}

export async function getDevfedInvite(): Promise<string> {
    const body = await fetchDevfedText('/invite_code')
    const invite = JSON.parse(body).invite_code
    if (!invite) throw new Error(`invite_code response had no invite: ${body}`)
    return invite
}

export async function generateDevfedEcash(msats: number): Promise<string> {
    const body = await fetchDevfedText(`/generate_ecash/${msats}`)
    const ecash = JSON.parse(body).ecash
    if (!ecash) throw new Error(`generate_ecash response had no ecash: ${body}`)
    return ecash
}

export async function setDevfedMeta(
    fields: Record<string, string>,
): Promise<void> {
    await fetchDevfedText('/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
    })
    console.log(`[devfed] meta set: ${JSON.stringify(fields)}`)
}

// Only moves when a seed backs up for the first time. A repeat backup replaces
// the old one.
export async function getDevfedBackupCount(): Promise<number> {
    const body = await fetchDevfedText('/backup_count')
    const count = JSON.parse(body).backup_count
    if (typeof count !== 'number') {
        throw new Error(`backup_count response had no count: ${body}`)
    }
    return count
}

export async function waitForDevfedBackupCountAbove(
    count: number,
    timeout = 180000,
): Promise<void> {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        if ((await getDevfedBackupCount()) > count) return
        await new Promise(r => setTimeout(r, 5000))
    }
    throw new Error(
        `no new backup reached the dev fed within ${timeout / 1000}s`,
    )
}
