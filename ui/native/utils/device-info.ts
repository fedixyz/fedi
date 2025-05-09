import RNDI from 'react-native-device-info'
import { exists, readFile } from 'react-native-fs'
import { getNumberFormatSettings, getTimeZone } from 'react-native-localize'

import { type FedimintBridge } from '@fedi/common/utils/fedimint'
import { makeLog } from '@fedi/common/utils/log'

const log = makeLog('native/utils/device-info')

/**
 * Single call to fetch all device info we want for debugging in parallel.
 */
export function getAllDeviceInfo() {
    const methodsToCall = [
        // Universal
        'getBuildId',
        'getBatteryLevel',
        'getBrand',
        'getDeviceId',
        'getFirstInstallTime',
        'getFontScale',
        'getFreeDiskStorage',
        'getInstallerPackageName',
        'getManufacturer',
        'getMaxMemory',
        'getPowerState',
        'getReadableVersion',
        'getSecurityPatch',
        'getSystemVersion',
        'getTotalDiskCapacity',
        'getTotalMemory',
        'getUsedMemory',
        'getUserAgent',
        'getVersion',
        'isCameraPresent',
        'hasNotch',
        'hasDynamicIsland',
        'isAirplaneMode',
        'isEmulator',
        'isKeyboardConnected',
        'isLandscape',
        'isHeadphonesConnected',
        'isTablet',
        'supportedAbis',
        // Android specifics
        'getAndroidId',
        'getApiLevel',
        'getDevice',
        'getIncremental',
        'getPreviewSdkInt',
        'getSystemAvailableFeatures',
        'hasGms',
        'hasHms',
        'isLowRamDevice',
        // iOS specifics
        'getBrightness',
        'isDisplayZoomed',
    ] satisfies Array<keyof typeof RNDI>

    const promises: Array<
        Promise<{
            method: string
            value: string | number | boolean | object
        } | null>
    > = methodsToCall.map(async method => {
        try {
            const value = await RNDI[method]()
            return { method, value }
        } catch {
            // Ignore methods that throw, likely means the OS doesn't support
            // this info call.
            return null
        }
    })

    promises.push(
        new Promise(resolve =>
            resolve({
                method: 'getTimeZone',
                value: getTimeZone(),
            }),
        ),
    )

    return Promise.all(promises).then(results => {
        const info: Record<string, string | number | boolean | object> = {}
        for (const result of results) {
            if (!result) continue
            // Transform 'getThing' keys to have 'thing' as the key. Leave
            // the 'isThing' and 'hasThing' keys as-is.
            const key = result.method
                .replace(/^get/, '')
                .replace(/^./, c => c.toLowerCase())
            info[key] = result.value
        }
        return info
    })
}
/**
 * Generates the user's OS information for use as a deviceId.
 *
 * This id MUST be unique and never change for the same device
 * This id MUST never be the same for two different devices
 * This id SHOULD contain a human-readable section as formatted in
 * the example below to help users distinguish between devices in a list.
 *
 * @returns {string} [Make / Model / Operating System]:Mobile:[uid]
 * @example iPhone7,2:Mobile:3d8f8f3d-8f3d-3d8f-8f3d-3d8f8f3d8f3d
 */
export async function generateDeviceId() {
    const uid = await RNDI.syncUniqueId()
    return `${RNDI.getDeviceId()}:Mobile:${uid}`
}

export function getOsFromDeviceId() {
    return RNDI.getDeviceId().includes('iPhone') ? 'iOS' : 'Android'
}

/**
 * Derives a locale that respects the user's number format settings.
 * This is a bit hacky but necessary since react-native-localize seems
 * to prefer language-based selection for the locale instead of number
 * format based selection which is problematic if the user has English
 * language set but with a non-USD number format.
 */
export function getNumberFormatLocale() {
    const numberSettings = getNumberFormatSettings()
    // The default 'en-US' covers:
    // - USA, UK, Australia, Canada (English), ...
    // Example: 1,234,567.89 (en-US, en-GB, en-AU)
    let derivedLocale = 'en-US'
    if (numberSettings.groupingSeparator === '.') {
        derivedLocale = 'de-DE' // German, Spanish, Italian, many EU countries, ...
        // Examples: 1.234.567,89 (de-DE, es-ES, it-IT)
    } else if (numberSettings.groupingSeparator === ' ') {
        derivedLocale = 'fr-FR' // French, Russian, ...
        // Examples: 1 234 567,89 (fr-FR, ru-RU)
    }
    return derivedLocale
}

export const isNightly = () => {
    return RNDI.getBundleId().includes('nightly')
}

export const dumpDB = async (
    fedimint: FedimintBridge,
    federationId: string | undefined,
) => {
    if (!federationId) {
        log.warn('Cannot include DB dump, no active federation is selected')
        return null
    }
    const dumpedDbPath = await fedimint.dumpDb({
        federationId,
    })
    if (await exists(dumpedDbPath)) {
        const dumpBuffer = await readFile(dumpedDbPath, 'base64')
        return {
            name: 'db.dump',
            content: dumpBuffer,
        }
    }
}
