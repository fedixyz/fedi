import difference from 'lodash/difference'

import {
    AnyInjectionRequestMessage,
    InjectionMessageType,
} from '@fedi/injections/src'

import { selectMiniAppPermissions } from '../redux/mod'
import {
    type MiniAppPermissionType,
    INJECTION_HANDLERS_PERMISSIONS_MAP,
} from '../types'
import { makeLog } from '../utils/log'
import { useCommonSelector } from './redux'

const log = makeLog('common/hooks/injections')

const getMissingInjectionPermissions = (
    injectionMessageType: InjectionMessageType,
    currentMiniAppPermissions: MiniAppPermissionType[],
): MiniAppPermissionType[] => {
    const requiredPermissions =
        INJECTION_HANDLERS_PERMISSIONS_MAP[injectionMessageType] || []

    log.info('getMissingInjectionPermissions', {
        requiredPermissions,
        currentMiniAppPermissions,
        injectionMessageType,
    })

    // check if mini-app is missing any of the required permissions
    const missingPermissions: MiniAppPermissionType[] = difference(
        requiredPermissions,
        currentMiniAppPermissions,
    )

    return missingPermissions
}

export const useInjectionsPermissions = ({
    currentMiniAppUrl,
    onValidationFailed,
}: {
    currentMiniAppUrl: string | undefined
    onValidationFailed: (missingPermissions: MiniAppPermissionType[]) => void
}) => {
    const currentMiniAppPermissions = useCommonSelector(s =>
        selectMiniAppPermissions(s, currentMiniAppUrl),
    )

    const validatePermissions = async (message: AnyInjectionRequestMessage) => {
        log.info('validatePermissions ', { currentMiniAppUrl, message })
        const { type } = message

        const missingPermissions = getMissingInjectionPermissions(
            type,
            currentMiniAppPermissions,
        )

        if (missingPermissions.length > 0) {
            onValidationFailed(missingPermissions)
            throw new Error(
                `missing permissions: ${missingPermissions.join(', ')}`,
            )
        }
    }

    return { validatePermissions }
}
