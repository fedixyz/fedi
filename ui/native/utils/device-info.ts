import RNDI from 'react-native-device-info'
import { v4 as uuidv4 } from 'uuid'

import { RpcRegisteredDevice } from '@fedi/common/types/bindings'
import dateUtils from '@fedi/common/utils/DateUtils'
import { makeLog } from '@fedi/common/utils/log'

import { SvgImageName } from '../components/ui/SvgImage'

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

    const promises = methodsToCall.map(async method => {
        try {
            const value = await RNDI[method]()
            return { method, value }
        } catch {
            // Ignore methods that throw, likely means the OS doesn't support
            // this info call.
            return null
        }
    })

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
 * This id must be unique and contain a human-readable section.
 * The human-readable section should help users to distinguish
 * devices within a device list.
 *
 * @returns {string} [Operating System]:Mobile:[uuid]
 * @example iPhone7,2:Mobile:3d8f8f3d-8f3d-3d8f-8f3d-3d8f8f3d8f3d
 */
export function generateDeviceId() {
    return `${RNDI.getDeviceId()}:Mobile:${uuidv4()}`
}

export function getOsFromDeviceId() {
    return RNDI.getDeviceId().includes('iPhone') ? 'iOS' : 'Android'
}

type FormattedDeviceInfo = {
    deviceName: string
    iconName: SvgImageName
    lastSeenAt: string
}
export function getFormattedDeviceInfo(
    device: RpcRegisteredDevice,
): FormattedDeviceInfo {
    let deviceName = 'Unknown'
    let iconName: SvgImageName = 'Error'
    let lastSeenAt = '-'
    try {
        const { deviceIdentifier, lastRegistrationTimestamp } = device
        const [hardware, platform, uuid] = deviceIdentifier.split(':')
        let os = hardware.includes('iPhone') ? 'iOS' : 'Android'
        iconName = hardware.includes('iPhone') ? 'DeviceIos' : 'DeviceAndroid'
        if (platform === 'Web') {
            os = 'Web'
            iconName = 'DeviceBrowser'
        }
        // use first 3 characters of uuid as a human-readable ID
        const shortId = uuid.split('-')[0].substring(0, 3).toUpperCase()
        deviceName = `${os} - ${shortId}`
        lastSeenAt = dateUtils.formatDeviceRegistrationTimestamp(
            lastRegistrationTimestamp,
        )
    } catch (error) {
        log.error('getFormattedDeviceInfo', error)
    }

    return {
        deviceName,
        iconName,
        lastSeenAt,
    }
}
