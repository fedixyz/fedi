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
import { isDev, isExperimental } from '../utils/environment'
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
    const currentMiniAppUrl = useCommonSelector(selectCurrentUrl)
    const currentMiniApp = useCommonSelector(state =>
        currentMiniAppUrl
            ? selectMiniAppByUrl(state, currentMiniAppUrl)
            : undefined,
    )
    const currentMiniAppPermissions = useCommonSelector(state =>
        currentMiniAppUrl
            ? selectMiniAppPermissions(state, currentMiniAppUrl)
            : undefined,
    )

    const requestedPermission = useCommonSelector(selectRequestedPermission)

    // Use miniapp title if available, fallback to url
    const miniAppName = currentMiniApp?.title || currentMiniAppUrl || undefined

    // Whether we can safely validate permissions
    const isReady = !!currentMiniAppUrl

    const validatePermissions = async (message: AnyInjectionRequestMessage) => {
        if (!isReady) {
            log.info('Skipping permission validation — URL not ready')
            return
        }

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
                currentMiniAppPermissions ?? {},
                requiredPermission,
            )

            if (state === true) {
                log.info('Permission already allowed', {
                    currentMiniAppUrl,
                    message: message.type,
                    requiredPermission,
                })
                // Already allowed, proceed to next permission
                continue
            }

            if (state === false) {
                log.info('Permission already denied', {
                    currentMiniAppUrl,
                    message: message.type,
                    requiredPermission,
                })
                onPermissionDenied(requiredPermission, miniAppName)
                throw new Error(
                    `Permission validation failed for ${currentMiniAppUrl}. Required permission: ${requiredPermission} set to always deny.`,
                )
            }

            if (isDev() || isExperimental()) {
                log.info('Permission not set. Asking user...', {
                    currentMiniAppUrl,
                    message: message.type,
                    requiredPermission,
                })
                // state is null, need to ask user
                // Promise rejects if user denies, which will propagate the error
                await dispatch(setRequestedPermission(requiredPermission))
                await onPermissionNeeded()
            } else {
                log.info('Permission requesting not available in production')
                onPermissionDenied(requiredPermission, miniAppName)
                throw new Error(
                    'Permission requesting not available in production',
                )
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
        if (!isReady) {
            log.info('Ignoring permission response — URL not ready')
            return
        }

        if (!requestedPermission) {
            log.info('No requested permission to respond to')
            return
        }

        log.info('Handling permission response', {
            didAllow,
            shouldRemember,
            requestedPermission,
            miniAppName,
        })

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
