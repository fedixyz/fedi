import { ResourceKey, TFunction } from 'i18next'

import { ErrorCode } from '../types/bindings'
import { BridgeError } from '../utils/fedimint'
import amountUtils from './AmountUtils'

type OnlyStrings<T> = T extends string ? T : never

// Contains all strings of ErrorCode
type ErrorCodeStrings = OnlyStrings<ErrorCode>

// Maps string BridgeErrors to i18n keys
const errorMap: Partial<Record<ErrorCodeStrings, ResourceKey>> = {
    payLnInvoiceAlreadyPaid: 'errors.invoice-already-paid',
}

export const formatBridgeError = (error: BridgeError, t: TFunction) => {
    // If there is no code, return the error as is
    if (!error.errorCode) return error.error

    const code = error.errorCode

    // If the code is a string and in the errorMap, return the mapped error
    if (typeof code === 'string' && code in errorMap) {
        const key: ResourceKey | undefined = errorMap[code]
        if (!key) return error.error
        return t(key)

        // If the code is an object, check for special error kinds
    } else if (typeof error.errorCode === 'object') {
        return handleSpecialErrors(error, t)

        // Default to the error message
    } else {
        return error.error
    }
}

// Handles non-string bridge error codes
const handleSpecialErrors = (error: BridgeError, t: TFunction) => {
    if (!error.errorCode || typeof error.errorCode !== 'object')
        return error.error
    if (
        'insufficientBalance' in error.errorCode &&
        typeof error.errorCode.insufficientBalance === 'number'
    ) {
        return t('errors.insufficient-balance-send', {
            sats: amountUtils.msatToSat(error.errorCode.insufficientBalance),
        })
    }

    return error.error
}
