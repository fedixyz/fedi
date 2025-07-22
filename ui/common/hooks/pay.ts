import { TFunction } from 'i18next'
import { useCallback, useEffect, useState } from 'react'

import {
    refreshLnurlReceive,
    selectLnurlReceiveCode,
    selectSupportsRecurringdLnurl,
} from '../redux'
import {
    AnyParsedData,
    Invoice,
    MSats,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedLnurlPay,
    ParserDataType,
    Sats,
} from '../types'
import { RpcFeeDetails } from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    MeltSummary,
    decodeCashuTokens,
    executeMelts,
    getMeltQuotes,
    type MeltResult,
} from '../utils/cashu'
import { FedimintBridge } from '../utils/fedimint'
import { lnurlPay } from '../utils/lnurl'
import { useSendForm } from './amount'
import { useCommonDispatch, useCommonSelector } from './redux'

const expectedOmniInputTypes = [
    ParserDataType.BitcoinAddress,
    ParserDataType.Bip21,
    ParserDataType.Bolt11,
    ParserDataType.LnurlPay,
    ParserDataType.CashuEcash,
] as const
type ExpectedInputData = Extract<
    AnyParsedData,
    { type: (typeof expectedOmniInputTypes)[number] }
>

interface OmniPaymentState {
    /** Whether or not an input has been entered that can be paid to */
    isReadyToPay: boolean
    /** The amount that must be sent with no ability to change, can be undefined */
    exactAmount: Sats | undefined
    /** The minimum amount that can be sent */
    minimumAmount: Sats
    /** The maximum amount that can be sent */
    maximumAmount: Sats
    /** A short description of the payment */
    description: string | undefined
    /** The fees associated with the payment */
    feeDetails: RpcFeeDetails | undefined
    /** Describes where the payment is being sent to (LN invoice, chat username, bitcoin address, etc) */
    sendTo: string | undefined
    /** Handles sending the payment when the user has confirmed, can throw errors */
    handleOmniSend: (
        amount: Sats,
        notes?: string,
    ) => Promise<{ preimage: string } | { txid: string } | MeltResult>
    /** For passing to <AmountInput amount /> prop or useAmountInput */
    inputAmount: Sats
    /** For passing to <AmountInput onChangeAmount /> prop useAmountInput */
    setInputAmount: (amount: Sats) => void
    /** For passing to the <OmniInput expectedInputTypes /> prop */
    expectedOmniInputTypes: typeof expectedOmniInputTypes
    /** For passing to the <OmniInput handleInput /> prop /> */
    handleOmniInput: (input: ExpectedInputData) => void
    /** For resetting all state */
    resetOmniPaymentState: () => void
}

/**
 * Handle validation and normalization of payment data between BOLT 11 invoices
 * and LNURL Payments. State from this is meant to be paired with useAmountInput
 * for inputting the amount for invoices or lnurl payments that have ambiguous
 * amounts to pay.
 */
export function useOmniPaymentState(
    fedimint: FedimintBridge,
    federationId: string | undefined,
    selectedPaymentFederation = false,
    t: TFunction,
): OmniPaymentState {
    const [feeDetails, setFeeDetails] = useState<RpcFeeDetails>()
    const [invoice, setInvoice] = useState<Invoice>()
    const [cashuMeltSummary, setCashuMeltSummary] = useState<MeltSummary>()
    const [lnurlPayment, setLnurlPayment] = useState<ParsedLnurlPay['data']>()
    const [bip21Payment, setBip21Payment] = useState<ParsedBip21['data']>()
    const [btcAddress, setBtcAddress] = useState<ParsedBitcoinAddress['data']>()
    const {
        inputAmount,
        setInputAmount,
        exactAmount,
        minimumAmount,
        maximumAmount,
        description,
        sendTo,
    } = useSendForm({
        btcAddress,
        bip21Payment,
        invoice,
        lnurlPayment,
        selectedPaymentFederation,
        cashuMeltSummary,
        t,
        fedimint,
    })

    useEffect(() => {
        const getOnchainFeeDetails = async () => {
            if (exactAmount && federationId && btcAddress) {
                try {
                    const fees = await fedimint.previewPayAddress(
                        btcAddress.address,
                        exactAmount,
                        federationId,
                    )
                    setFeeDetails(fees)
                } catch (error) {
                    setFeeDetails(undefined)
                }
            }
        }
        getOnchainFeeDetails()
    }, [
        bip21Payment,
        btcAddress,
        exactAmount,
        federationId,
        fedimint,
        setFeeDetails,
    ])

    const handleOmniInput = useCallback(
        async (input: ExpectedInputData) => {
            if (input.type === ParserDataType.Bolt11 && federationId) {
                const decoded = await fedimint.decodeInvoice(
                    input.data.invoice,
                    federationId,
                )
                if (decoded.amount) {
                    setInputAmount(amountUtils.msatToSat(decoded.amount))
                }
                setInvoice(decoded)
                if (decoded.fee) {
                    setFeeDetails(decoded.fee)
                }
            } else if (input.type === ParserDataType.LnurlPay) {
                if (input.data.minSendable) {
                    setInputAmount(
                        amountUtils.msatToSat(input.data.minSendable),
                    )
                }
                setLnurlPayment(input.data)
            } else if (input.type === ParserDataType.Bip21) {
                if (
                    'amount' in input.data &&
                    input.data.amount &&
                    federationId
                ) {
                    const amountSats = amountUtils.btcToSat(input.data.amount)
                    setInputAmount(amountSats)
                }
                setBip21Payment(input.data)
                setBtcAddress({ address: input.data.address })
            } else if (input.type === ParserDataType.BitcoinAddress) {
                setBtcAddress(input.data)
            } else if (
                input.type === ParserDataType.CashuEcash &&
                federationId
            ) {
                const tokens = decodeCashuTokens(input.data.token)
                const meltSummary = await getMeltQuotes(
                    tokens,
                    fedimint,
                    federationId,
                )
                setCashuMeltSummary(meltSummary)
                setInputAmount(amountUtils.msatToSat(meltSummary.totalAmount))
                setFeeDetails({
                    fediFee: 0 as MSats,
                    networkFee: meltSummary.totalFees,
                    federationFee: 0 as MSats,
                })
            }
        },
        [federationId, fedimint, setInputAmount, setCashuMeltSummary],
    )

    const handleOmniSend = useCallback(
        async (amount: Sats, notes?: string) => {
            if (!federationId) {
                throw new Error('Must have a federation ID to send')
            }
            if (invoice) {
                return fedimint.payInvoice(invoice.invoice, federationId, notes)
            } else if (lnurlPayment) {
                return lnurlPay(
                    fedimint,
                    federationId,
                    lnurlPayment,
                    amountUtils.satToMsat(amount),
                    notes,
                ).match(
                    ok => ok,
                    e => {
                        // TODO: refactor handleOmniSend to return a ResultAsync
                        // and don't throw
                        throw e
                    },
                )
            } else if (bip21Payment) {
                return fedimint.payAddress(
                    bip21Payment.address,
                    amount,
                    federationId,
                    notes,
                )
            } else if (btcAddress) {
                return fedimint.payAddress(
                    btcAddress.address,
                    amount,
                    federationId,
                    notes,
                )
            } else if (cashuMeltSummary) {
                return executeMelts(cashuMeltSummary)
            } else {
                throw new Error(
                    'Requires invoice, lnurl payment, bip21 payment, or btc address to send',
                )
            }
        },
        [
            federationId,
            invoice,
            lnurlPayment,
            bip21Payment,
            btcAddress,
            cashuMeltSummary,
            fedimint,
        ],
    )

    const resetOmniPaymentState = useCallback(() => {
        setFeeDetails(undefined)
        setInvoice(undefined)
        setLnurlPayment(undefined)
        setBtcAddress(undefined)
        setBip21Payment(undefined)
        setInputAmount(0 as Sats)
        setCashuMeltSummary(undefined)
    }, [setInputAmount])

    return {
        isReadyToPay:
            !!invoice ||
            !!lnurlPayment ||
            !!btcAddress ||
            !!bip21Payment ||
            !!cashuMeltSummary,
        exactAmount,
        minimumAmount,
        maximumAmount,
        feeDetails,
        description,
        sendTo,
        handleOmniSend,
        inputAmount,
        setInputAmount,
        expectedOmniInputTypes,
        handleOmniInput,
        resetOmniPaymentState,
    }
}

export function useLnurlReceiveCode(
    fedimint: FedimintBridge,
    federationId: string,
) {
    const supportsLnurl = useCommonSelector(selectSupportsRecurringdLnurl)
    const lnurlReceiveCode = useCommonSelector(selectLnurlReceiveCode)
    const dispatch = useCommonDispatch()
    const [isFetching, setIsFetching] = useState(false)

    useEffect(() => {
        const refreshCode = async () => {
            setIsFetching(true)
            await dispatch(refreshLnurlReceive({ fedimint, federationId }))
            setIsFetching(false)
        }
        // Only runs once. supportsLnurl is null on first load.
        if (!isFetching && supportsLnurl === null) {
            refreshCode()
        }
    }, [fedimint, federationId, supportsLnurl, dispatch, isFetching])

    return {
        isLoading: isFetching || supportsLnurl === null,
        lnurlReceiveCode,
        supportsLnurl,
    }
}
