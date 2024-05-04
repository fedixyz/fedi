import { v4 as uuidv4 } from 'uuid'

/**
 * Gets the user's OS information for use as a deviceId.
 *
 * This id must be unique and contain a human-readable section.
 * The human-readable section should help users to distinguish
 * devices within a device list.
 *
 * @returns {string} [Operating System]:Web:[uuid]
 * @example MacOS:Web:3d8f8f3d-8f3d-3d8f-8f3d-3d8f8f3d8f3d
 */
export function generateDeviceId() {
    let os = 'Unknown OS'
    if (navigator.userAgent.indexOf('Win') != -1) os = 'Windows'
    else if (navigator.userAgent.indexOf('Mac') != -1) os = 'MacOS'
    else if (navigator.userAgent.indexOf('X11') != -1) os = 'UNIX'
    else if (navigator.userAgent.indexOf('Linux') != -1) os = 'Linux'
    return `${os}:Web:${uuidv4()}`
}
