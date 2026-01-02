import {
    FIRST_PARTY_PERMISSIONS,
    MiniAppPermissionType,
    miniAppPermissionTypes,
    RememberedPermissionsMap,
} from '../types'

/**
 * Get the remembered state for a specific permission
 * @returns true (always allow), false (always deny), or undefined (ask every time)
 */
export const getPermissionState = (
    permissions: RememberedPermissionsMap,
    permissionType: MiniAppPermissionType,
): boolean | undefined => {
    return permissions[permissionType]
}

/**
 * Get all allowed permissions for an origin
 * @returns Array of permission types that are explicitly allowed (state === true)
 */
export const getOriginPermissions = (
    origin: string,
): MiniAppPermissionType[] => {
    const rememberedPermissions = FIRST_PARTY_PERMISSIONS[origin]
    if (!rememberedPermissions) return []

    return miniAppPermissionTypes.filter(
        permissionType =>
            getPermissionState(rememberedPermissions, permissionType) === true,
    )
}

/**
 * Check if an origin has all required permissions
 * @returns true if all required permissions are explicitly allowed (state === true)
 */
export const hasPermission = (
    origin: string,
    requiredPermissions: MiniAppPermissionType[],
) => {
    const actual = new Set(getOriginPermissions(origin))

    return requiredPermissions.every(requiredPermission =>
        actual.has(requiredPermission),
    )
}
