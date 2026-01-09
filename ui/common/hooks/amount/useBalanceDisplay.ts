import { TFunction } from 'i18next'

import { Federation } from '../../types'
import { useBalance } from './useBalance'

/**
 * Provides a string displaying the balance as both fiat and sat.
 */
export function useBalanceDisplay(
    t: TFunction,
    federationId: Federation['id'],
) {
    const { formattedBalance } = useBalance(federationId)

    if (!federationId) return ''
    return `${t('words.balance')}: ${formattedBalance}`
}
