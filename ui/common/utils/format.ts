import { ResourceKey, TFunction } from 'i18next'
import { Err } from 'neverthrow'

import { SelectableCurrency } from '../types'
import { ErrorCode } from '../types/bindings'
import { BridgeError } from '../utils/errors'
import amountUtils from './AmountUtils'
import { getCurrencyCode } from './currency'

/**
 * Attempts to turn an unknown error object into a user-readable message.
 * The message can either be plaintext, or a translation key which will
 * be translated.
 */
export function formatErrorMessage<T extends TFunction>(
    t: T,
    err: unknown,
    defaultMessage: ResourceKey = 'errors.unknown-error',
): string {
    if (err instanceof BridgeError) return formatBridgeError(err, t)
    if (err instanceof Err) err = err.error

    if (typeof err === 'string') return t(err as ResourceKey)

    if (err && typeof err === 'object') {
        let msg = defaultMessage

        if ('message' in err && typeof err.message === 'string')
            msg = err.message

        const translatedMsg = t(msg)

        if ('_tag' in err && typeof err._tag === 'string')
            return `${err._tag}: ${translatedMsg}`

        return translatedMsg
    }

    return t(defaultMessage)
}

type OnlyStrings<T> = T extends string ? T : never
type StringBridgeErrorCodes = OnlyStrings<ErrorCode>
const bridgeErrorMap: Partial<Record<StringBridgeErrorCodes, ResourceKey>> = {
    payLnInvoiceAlreadyPaid: 'errors.invoice-already-paid',
}

export const formatBridgeError = (
    { error, errorCode }: BridgeError,
    t: TFunction,
): string => {
    // Handle bridge errors that are just strings
    if (typeof errorCode === 'string' && errorCode in bridgeErrorMap) {
        return t(bridgeErrorMap[errorCode])
    }

    // Handle bridge errors that include an errorCode object
    if (errorCode && typeof errorCode === 'object') {
        if ('insufficientBalance' in errorCode) {
            return t('errors.insufficient-balance-send', {
                sats: amountUtils.msatToSat(errorCode.insufficientBalance),
            })
        }
    }

    return error
}

export function formattedCurrencyName<T extends TFunction>(
    t: T,
    currency: SelectableCurrency,
) {
    const i18nKey = `feature.settings.currency-names.${currency.toLowerCase()}`

    return t(i18nKey as ResourceKey)
}

export function formatCurrencyText<T extends TFunction>(
    t: T,
    currency: SelectableCurrency,
) {
    return `${getCurrencyCode(currency)} - ${formattedCurrencyName(t, currency)}`
}
