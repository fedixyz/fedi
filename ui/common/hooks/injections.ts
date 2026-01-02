import { AnyInjectionRequestMessage } from '@fedi/injections/src'

import {
    selectCurrentUrl,
    selectRequestedPermission,
    setRequestedPermission,
} from '../redux/browser'
import {
    allowMiniAppPermissions,
    denyMiniAppPermissions,
    selectMiniAppByUrl,
    selectMiniAppPermissions,
} from '../redux/mod'
import {
    type MiniAppPermissionType,
    INJECTION_HANDLERS_PERMISSIONS_MAP,
} from '../types'
import { isDev, isNightly } from '../utils/environment'
import { makeLog } from '../utils/log'
import { getPermissionState } from './browser'
import { useCommonDispatch, useCommonSelector } from './redux'

const log = makeLog('common/hooks/injections')

export const useInjectionsPermissions = ({
    onPermissionNeeded,
    onPermissionDenied,
}: {
    onPermissionNeeded: () => Promise<void>
    onPermissionDenied: (
        permission: MiniAppPermissionType,
        miniAppName: string | undefined,
    ) => void
}) => {
    const dispatch = useCommonDispatch()
    const currentMiniAppUrl = useCommonSelector(s => selectCurrentUrl(s) || '')
    const currentMiniApp = useCommonSelector(s =>
        selectMiniAppByUrl(s, currentMiniAppUrl ?? ''),
    )
    const currentMiniAppPermissions = useCommonSelector(s =>
        selectMiniAppPermissions(s, currentMiniAppUrl),
    )
    const requestedPermission = useCommonSelector(selectRequestedPermission)
    // use the miniapp title if available, fallback to url
    const miniAppName = currentMiniApp?.title || currentMiniAppUrl

    const validatePermissions = async (message: AnyInjectionRequestMessage) => {
        log.info('Validating permissions for:', {
            currentMiniAppUrl,
            message: message.type,
        })
        const requiredPermissions =
            INJECTION_HANDLERS_PERMISSIONS_MAP[message.type] || []

        if (requiredPermissions.length > 0) {
            log.info(
                `${message.type} requires permissions: ${requiredPermissions.join(', ')}`,
            )
        } else {
            log.info(`${message.type} does not require any permissions`)
        }
        for (const requiredPermission of requiredPermissions) {
            const state = getPermissionState(
                currentMiniAppPermissions,
                requiredPermission,
            )

            if (state === true) {
                log.info('Permission already allowed: ', {
                    currentMiniAppUrl,
                    message: message.type,
                    requiredPermission,
                })
                // Already allowed, proceed to next permission
                continue
            } else if (state === false) {
                log.info('Permission already denied: ', {
                    currentMiniAppUrl,
                    message: message.type,
                    requiredPermission,
                })
                // Already denied
                onPermissionDenied(requiredPermission, miniAppName)
                throw new Error(
                    `Permission validation failed for ${currentMiniAppUrl}. Required permission: ${requiredPermission} set to always deny.`,
                )
            } else {
                if (isDev() || isNightly()) {
                    log.info('Permission not set. Asking user... ', {
                        currentMiniAppUrl,
                        message: message.type,
                        requiredPermission,
                    })
                    // state is null, need to ask user
                    // Promise rejects if user denies, which will propagate the error
                    await dispatch(setRequestedPermission(requiredPermission))
                    await onPermissionNeeded()
                } else {
                    log.info(
                        'Permission requesting not available in production',
                    )
                    onPermissionDenied(requiredPermission, miniAppName)
                    throw new Error(
                        'Permission requesting not available in production',
                    )
                }
            }
        }
        log.info('Permissions validation succeeded for ', {
            currentMiniAppUrl,
            message: message.type,
        })
    }

    const handlePermissionResponse = (
        didAllow: boolean,
        shouldRemember: boolean,
    ) => {
        log.info('handlePermissionResponse ', {
            didAllow,
            shouldRemember,
            requestedPermission,
            miniAppName,
        })
        if (requestedPermission === null) {
            return
        }

        // Show toast if user denied permission
        if (!didAllow) {
            onPermissionDenied(requestedPermission, miniAppName)
        }

        // Remember the user's choice if requested
        if (shouldRemember && currentMiniAppUrl) {
            if (didAllow) {
                dispatch(
                    allowMiniAppPermissions({
                        miniAppUrl: currentMiniAppUrl,
                        permissions: [requestedPermission],
                    }),
                )
            } else {
                dispatch(
                    denyMiniAppPermissions({
                        miniAppUrl: currentMiniAppUrl,
                        permissions: [requestedPermission],
                    }),
                )
            }
        }
    }

    return {
        validatePermissions,
        handlePermissionResponse,
    }
}
