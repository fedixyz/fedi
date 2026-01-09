import {
    selectFederationBalance,
    selectMaxStableBalanceSats,
    selectMinimumDepositAmount,
    selectStabilityPoolAvailableLiquidity,
    selectStableBalanceSats,
} from '../../redux'
import { Federation, Sats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'

/**
 * Get the minimum and maximum amount you can deposit to the stable balance
 */
export function useMinMaxDepositAmount(federationId: Federation['id']) {
    const minimumAmount = useCommonSelector(s =>
        selectMinimumDepositAmount(s, federationId),
    )
    const balanceMSats = useCommonSelector(s =>
        selectFederationBalance(s, federationId),
    )
    const balanceSats = amountUtils.msatToSat(balanceMSats)
    const stableBalanceSats = useCommonSelector(s =>
        selectStableBalanceSats(s, federationId),
    )
    const maxStableBalanceSats = useCommonSelector(s =>
        selectMaxStableBalanceSats(s, federationId),
    )
    const stabilityPoolAvailableLiquidity = useCommonSelector(s =>
        selectStabilityPoolAvailableLiquidity(s, federationId),
    )
    const availableLiquiditySats = stabilityPoolAvailableLiquidity
        ? amountUtils.msatToSat(stabilityPoolAvailableLiquidity)
        : 0

    // ref: https://github.com/fedibtc/fedi/pull/5654/files#r1842633164
    const maximumAmount = Math.min(
        // User's current bitcoin wallet balance
        balanceSats,
        // Available liquidity in the stability pool
        availableLiquiditySats,
        // Maximum stable balance allowed as defined in meta minus the user's
        // current stable balance
        maxStableBalanceSats === undefined
            ? // If maxStableBalanceSats is not defined in metadata, this makes sure it
              // is never selected by Math.min()
              Number.MAX_SAFE_INTEGER
            : // subtract user balance but make sure we don't go negative if maxStableBalanceSats is 0
              Math.max(0, maxStableBalanceSats - stableBalanceSats),
    ) as Sats

    return { minimumAmount, maximumAmount }
}
