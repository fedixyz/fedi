import { TFunction } from 'i18next'

import { SupportedCurrency } from '../types'

/**
 * Attempts to turn an unknown error object into a user-readable message.
 * The message can either be plaintext, or a translation key which will
 * be translated.
 */
export function formatErrorMessage<T extends TFunction>(
    t: T,
    err: unknown,
    defaultMessage = 'errors.unknown-error',
) {
    if (!err) return t(defaultMessage as Parameters<T>[0], defaultMessage)
    if (typeof err === 'string') {
        return t(err as Parameters<T>[0], err)
    }
    if (
        err &&
        typeof err === 'object' &&
        'message' in err &&
        typeof (err as Error).message === 'string'
    ) {
        return t(
            (err as Error).message as Parameters<T>[0],
            (err as Error).message,
        )
    }
    return defaultMessage
}

export function formatCurrencyText<T extends TFunction>(
    t: T,
    currency: SupportedCurrency,
) {
    const i18nKey = `feature.settings.currency-names.${currency.toLowerCase()}`

    return `${currency} - ${t(i18nKey as Parameters<T>[0])}`
}
