import {
    selectMinimumWithdrawAmountMsats,
    selectWithdrawableStableBalanceMsats,
} from '../../redux'
import { Federation } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'

/**
 * Get the minimum and maximum amount you can withdraw from the stable balance
 */
export function useMinMaxWithdrawAmount(federationId: Federation['id']) {
    const minimumMsats = useCommonSelector(s =>
        selectMinimumWithdrawAmountMsats(s, federationId),
    )
    const withdrawableMsats = useCommonSelector(s =>
        selectWithdrawableStableBalanceMsats(s, federationId),
    )
    const minimumAmount = amountUtils.msatToSat(minimumMsats)
    const maximumAmount = amountUtils.msatToSat(withdrawableMsats)

    return { minimumAmount, maximumAmount }
}
