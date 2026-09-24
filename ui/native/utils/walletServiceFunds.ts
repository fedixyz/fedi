import { LoadedFederation, MSats } from '@fedi/common/types'

export const PPM_DENOMINATOR = 1_000_000

/**
 * Held back from what a wallet is offered as able to send.
 *
 * The lightning module fee is a known ppm, but the gateway's routing fee is not
 * known until the invoice exists, and it is charged on top of the invoice — a
 * wallet holding exactly the asked amount cannot pay an invoice for it.
 */
export const TOP_UP_SEND_RESERVE_SATS = 100

/** What a wallet can move over lightning, once its send fees are taken off. */
export const sendableMsatsOf = (federation: LoadedFederation): MSats => {
    const sendPpm = federation.fediFeeSchedule.modules.ln?.sendPpm ?? 0
    const moduleFee = Math.ceil(
        (federation.balance * sendPpm) / PPM_DENOMINATOR,
    )
    const reserve = TOP_UP_SEND_RESERVE_SATS * 1000
    return Math.max(0, federation.balance - moduleFee - reserve) as MSats
}

/**
 * Everything the user could put behind the paying wallet without leaving the
 * app: what it already holds, plus what every other wallet could send it.
 *
 * The payer counts at its balance and the rest at what they can send, because
 * a transfer loses its fee on the way. Measured against the setup cost this
 * separates a gap that topping up can close from one that cannot, which is the
 * difference between "top up to continue" and "you need funds from outside".
 *
 * An undercount is possible and is the safe direction: a wallet that is still
 * loading is not counted, and a stability pool balance is not part of
 * `balance`. So this supports "your Federations hold X", never "you cannot
 * afford this".
 */
export const reachableMsats = (
    federations: LoadedFederation[],
    payerFederationId: string,
    payerBalanceMsats: MSats,
): MSats =>
    federations
        .filter(f => f.id !== payerFederationId)
        .reduce<number>(
            (total, f) => total + sendableMsatsOf(f),
            payerBalanceMsats,
        ) as MSats
