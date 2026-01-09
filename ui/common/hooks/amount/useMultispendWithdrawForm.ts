import { selectMultispendBalance } from '../../redux'
import { Federation, Sats, UsdCents } from '../../types'
import { RpcRoomId } from '../../types/bindings'
import { useCommonSelector } from '../redux'
import { useBtcFiatPrice } from './useBtcFiatPrice'
import { useWithdrawForm } from './useWithdrawForm'

/**
 * Provide all the state necessary to implement a multispend withdrawal form
 * that transfers stable balance from a multispend account to a personal account
 */
export function useMultispendWithdrawForm(
    roomId: RpcRoomId,
    federationId: Federation['id'],
) {
    const { inputAmount, inputAmountCents, setInputAmount } =
        useWithdrawForm(federationId)
    const { convertCentsToSats } = useBtcFiatPrice()
    const multispendBalancePrecise = useCommonSelector(s =>
        selectMultispendBalance(s, roomId),
    )
    // TODO: Allow full withdrawals of multispend balance
    // see https://github.com/fedibtc/fedi/issues/7223#issuecomment-2907830916
    // Since we don't have sub-cent precision for multispend withdrawals,
    // we round down from the total balance so the request doesn't get stuck
    // in the approved state then convert to sats to adapt it to the AmountInput component
    const maximumAmountCents = Math.floor(multispendBalancePrecise) as UsdCents
    const maximumAmountSats = convertCentsToSats(maximumAmountCents)

    return {
        inputAmount,
        inputAmountCents,
        setInputAmount,
        minimumAmount: 0 as Sats,
        maximumAmount: maximumAmountSats as Sats,
    }
}
