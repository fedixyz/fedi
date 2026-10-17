import {
    selectIsBtcMultispendGroup,
    selectMinimumDepositAmount,
    selectMultispendBalance,
    selectMultispendBalanceMsats,
} from '../../redux'
import { Federation, Sats, UsdCents } from '../../types'
import { RpcRoomId } from '../../types/bindings'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'
import { useBtcFiatPrice } from './useBtcFiatPrice'
import { useWithdrawForm } from './useWithdrawForm'

/**
 * Provide all the state necessary to implement a multispend withdrawal form
 * that transfers balance from a multispend account to a personal account.
 * The bridge refuses a bitcoin request under the stability pool minimum seek.
 */
export function useMultispendWithdrawForm(
    roomId: RpcRoomId,
    federationId: Federation['id'],
) {
    const { inputAmount, inputAmountCents, setInputAmount } =
        useWithdrawForm(federationId)
    const { convertCentsToSats } = useBtcFiatPrice()
    const isBtcOnly = useCommonSelector(s =>
        selectIsBtcMultispendGroup(s, roomId),
    )
    const multispendBalancePrecise = useCommonSelector(s =>
        selectMultispendBalance(s, roomId),
    )
    const multispendBalanceMsats = useCommonSelector(s =>
        selectMultispendBalanceMsats(s, roomId),
    )
    const minimumSeekSats = useCommonSelector(s =>
        selectMinimumDepositAmount(s, federationId),
    )
    // TODO: Allow full withdrawals of multispend balance
    // see https://github.com/fedibtc/fedi/issues/7223#issuecomment-2907830916
    // Since we don't have sub-cent precision for multispend withdrawals,
    // we round down from the total balance so the request doesn't get stuck
    // in the approved state then convert to sats to adapt it to the AmountInput component
    const maximumAmountCents = Math.floor(multispendBalancePrecise) as UsdCents
    const maximumAmountSats = isBtcOnly
        ? amountUtils.msatToSat(multispendBalanceMsats)
        : convertCentsToSats(maximumAmountCents)

    return {
        inputAmount,
        inputAmountCents,
        setInputAmount,
        isBtcOnly,
        minimumAmount: (isBtcOnly ? minimumSeekSats : 0) as Sats,
        maximumAmount: maximumAmountSats as Sats,
    }
}
