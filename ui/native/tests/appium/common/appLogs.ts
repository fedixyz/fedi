import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import AppiumManager from '../../configs/appium/AppiumManager'
import { Platform, currentPlatform } from '../../configs/appium/types'

export type AppLog = 'bridge' | 'ui'

const LOG_PREFIX: Record<AppLog, string> = {
    bridge: 'fedi.log.',
    ui: 'fedi-ui.',
}

// The bridge writes fedi.log.<unixday> and the JS logger writes
// fedi-ui.<i>.log inside the app sandbox, not to logcat.
export function readAppLog(handle: string, log: AppLog): Buffer | null {
    const udid = AppiumManager.deviceId(handle)
    if (!udid) return null
    const prefix = LOG_PREFIX[log]

    if (currentPlatform === Platform.ANDROID) {
        const appId = process.env.APP_PACKAGE || 'com.fedi'
        return execFileSync(
            'adb',
            [
                '-s',
                udid,
                'exec-out',
                'run-as',
                appId,
                'sh',
                '-c',
                `cat files/${prefix}*`,
            ],
            { maxBuffer: 64 * 1024 * 1024 },
        )
    }

    // On iOS the files live in the app's Documents dir, which simctl
    // exposes on the host filesystem through the app's data container.
    const bundleId = process.env.APP_BUNDLE_ID || 'org.fedi.alpha'
    const container = execFileSync(
        'xcrun',
        ['simctl', 'get_app_container', udid, bundleId, 'data'],
        { encoding: 'utf8' },
    ).trim()
    const docsDir = path.join(container, 'Documents')
    const parts = fs
        .readdirSync(docsDir)
        .filter(f => f.startsWith(prefix))
        .sort()
        .map(f => fs.readFileSync(path.join(docsDir, f)))
    return parts.length > 0 ? Buffer.concat(parts) : null
}
