import dateUtils from '@fedi/common/utils/DateUtils'

import { RpcRegisteredDevice } from '../types/bindings'

type IconName = 'DeviceIos' | 'DeviceAndroid' | 'DeviceBrowser' | 'Error'

type FormattedDeviceInfo = {
    deviceName: string
    iconName: IconName
    lastSeenAt: string
}

export function getFormattedDeviceInfo(
    device: RpcRegisteredDevice,
): FormattedDeviceInfo {
    let deviceName
    let iconName: IconName
    let lastSeenAt

    try {
        const { deviceIdentifier, lastRegistrationTimestamp } = device
        const deviceIdentifierParts = deviceIdentifier.split(':')

        if (deviceIdentifierParts.length !== 3) {
            throw Error()
        }

        const [hardware, platform, uuid] = deviceIdentifierParts

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

        return {
            deviceName,
            iconName,
            lastSeenAt,
        }
    } catch (error) {
        return {
            deviceName: 'Unknown',
            iconName: 'Error',
            lastSeenAt: '-',
        }
    }
}
