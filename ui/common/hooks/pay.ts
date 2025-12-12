import { TFunction } from 'i18next'
import { useCallback, useEffect, useState } from 'react'

import {
    joinFederation,
    receiveEcash,
    refreshFederations,
    listGateways,
    selectFederation,
    selectLoadedFederation,
    setLastUsedFederationId,
} from '../redux'
import {
    AnyParsedData,
    Invoice,
    Federation,
    MSats,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedLnurlPay,
    ParserDataType,
    Sats,
} from '../types'
import {
    RpcEcashInfo,
    RpcFeeDetails,
    RpcFederationPreview,
} from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    getFederationPreview,
    shouldShowInviteCode,
} from '../utils/FederationUtils'
import {
    MeltSummary,
    decodeCashuTokens,
    executeMelts,
    getMeltQuotes,
    type MeltResult,
} from '../utils/cashu'
import { FedimintBridge } from '../utils/fedimint'
import { formatErrorMessage } from '../utils/format'
import { lnurlPay } from '../utils/lnurl'
import { makeLog } from '../utils/log'
import { useSendForm } from './amount'
import { useCommonDispatch, useCommonSelector } from './redux'

const log = makeLog('common/hooks/pay')

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
    handleOmniInput: (input: ExpectedInputData) => Promise<void>
    /** For resetting all state */
    resetOmniPaymentState: () => void
    /** Whether or not state is being processed */
    isLoading: boolean
    /** User-facing error message to display if anything went wrong */
    error: string | null
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
    t: TFunction,
): OmniPaymentState {
    const dispatch = useCommonDispatch()
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
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
        reset: resetSendForm,
    } = useSendForm({
        btcAddress,
        bip21Payment,
        invoice,
        lnurlPayment,
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
                } catch {
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
            try {
                setIsLoading(true)
                // reset fee details since it will change when switching federations
                setFeeDetails(undefined)
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
                        const amountSats = amountUtils.btcToSat(
                            input.data.amount,
                        )
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
                    setInputAmount(
                        amountUtils.msatToSat(meltSummary.totalAmount),
                    )
                    setFeeDetails({
                        fediFee: 0 as MSats,
                        networkFee: meltSummary.totalFees,
                        federationFee: 0 as MSats,
                    })
                }
            } catch (err) {
                log.error('handleOmniInput', err)
                setError(formatErrorMessage(t, err, 'errors.unknown-error'))
            } finally {
                setIsLoading(false)
            }
        },
        [federationId, fedimint, setInputAmount, t],
    )

    const handleOmniSend = useCallback(
        async (amount: Sats, notes?: string) => {
            try {
                if (!federationId) {
                    throw new Error('Must have a federation ID to send')
                }
                // guard LN operations with a gateway check
                // TODO: remove this and depend entirely on bridge error handling for this?
                if (invoice || lnurlPayment) {
                    const gateways = await dispatch(
                        listGateways({ fedimint, federationId }),
                    ).unwrap()

                    if (!gateways.length) {
                        throw new Error(t('errors.no-lightning-gateways'))
                    }
                }
                if (invoice) {
                    return await fedimint.payInvoice(
                        invoice.invoice,
                        federationId,
                        notes,
                    )
                } else if (lnurlPayment) {
                    return await lnurlPay(
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
                    return await fedimint.payAddress(
                        bip21Payment.address,
                        amount,
                        federationId,
                        notes,
                    )
                } else if (btcAddress) {
                    return await fedimint.payAddress(
                        btcAddress.address,
                        amount,
                        federationId,
                        notes,
                    )
                } else if (cashuMeltSummary) {
                    return await executeMelts(cashuMeltSummary)
                } else {
                    throw new Error(
                        'Requires invoice, lnurl payment, bip21 payment, or btc address to send',
                    )
                }
            } catch (err) {
                log.error('handleOmniSend', err)
                setError(formatErrorMessage(t, err, 'errors.unknown-error'))
                throw err
            } finally {
                if (federationId)
                    dispatch(setLastUsedFederationId(federationId))
            }
        },
        [
            t,
            dispatch,
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
        setCashuMeltSummary(undefined)
        resetSendForm()
    }, [resetSendForm])

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
        isLoading,
        error,
    }
}

export function useSendEcash(fedimint: FedimintBridge, federationId: string) {
    const federation = useCommonSelector(s => selectFederation(s, federationId))
    const dispatch = useCommonDispatch()

    const [notes, setNotes] = useState<string | null>(null)
    const [operationId, setOperationId] = useState<string | null>(null)
    const [isGeneratingEcash, setIsGeneratingEcash] = useState(false)

    const reset = () => {
        setNotes(null)
        setOperationId(null)
        setIsGeneratingEcash(false)
    }

    const generateEcash = useCallback(
        async (amount: Sats, memo: string = '') => {
            if (!federation?.meta) return

            setIsGeneratingEcash(true)

            try {
                const msats = amountUtils.satToMsat(amount)
                const includeInvite = shouldShowInviteCode(federation.meta)
                const res = await fedimint.generateEcash(
                    msats,
                    federation.id,
                    includeInvite,
                    {
                        initialNotes: memo ?? null,
                        recipientMatrixId: null,
                        senderMatrixId: null,
                    },
                )

                setOperationId(res.operationId)
                setNotes(res.ecash)

                return res
            } catch (e) {
                log.error('Failed to generate ecash notes', e)
                throw e
            } finally {
                setIsGeneratingEcash(false)
                dispatch(setLastUsedFederationId(federation.id))
            }
        },
        [federation, fedimint, dispatch],
    )

    return {
        operationId,
        notes,
        isGeneratingEcash,
        generateEcash,
        reset,
    }
}

export function useParseEcash(fedimint: FedimintBridge) {
    const [ecashToken, setEcashToken] = useState<string>('')
    const [loading, setLoading] = useState(false) // used for page loader
    const [parsedEcash, setParsedEcash] = useState<RpcEcashInfo | null>(null)
    const [federationPreview, setFederationPreview] =
        useState<RpcFederationPreview | null>(null)
    const [isError, setIsError] = useState(false)

    // Return federation if they have already joined issuing federation
    const loadedFederation = useCommonSelector(s => {
        if (parsedEcash?.federation_type === 'joined') {
            return selectLoadedFederation(s, parsedEcash.federation_id)
        }

        return null
    })

    const parseEcashFn = useCallback(
        async (token: string) => {
            setEcashToken(token)
            setIsError(false)
            setLoading(true)

            try {
                const parsed = await fedimint.parseEcash(
                    decodeURIComponent(token),
                )
                setParsedEcash(parsed)

                // If user hasn't already joined this federation then get preview
                if ('federation_invite' in parsed) {
                    const preview = await getFederationPreview(
                        parsed.federation_invite as string,
                        fedimint,
                    )
                    setFederationPreview(preview)
                }
            } catch (e) {
                setIsError(true)
                log.error('Ecash token could not be parsed')
            } finally {
                setLoading(false)
            }
        },
        [fedimint],
    )

    return {
        parseEcash: parseEcashFn,
        loading,
        parsed: parsedEcash,
        ecashToken,
        isError,
        federation: loadedFederation || federationPreview,
    }
}

export function useClaimEcash(fedimint: FedimintBridge) {
    const dispatch = useCommonDispatch()

    const [loading, setLoading] = useState(false)
    const [claimed, setEcashClaimed] = useState(false)
    const [isError, setIsError] = useState(false)

    const claimEcash = useCallback(
        async (parsedEcash: RpcEcashInfo, ecashToken: string) => {
            if (!parsedEcash) return
            let joinedFederation: Federation | null = null

            try {
                setIsError(false)
                setLoading(true)

                // User isn't part of federation that ecash was sent from
                // so join the federation first
                if ('federation_invite' in parsedEcash) {
                    joinedFederation = await dispatch(
                        joinFederation({
                            fedimint,
                            code: parsedEcash.federation_invite as string,
                            recoverFromScratch: false,
                        }),
                    ).unwrap()

                    // refresh all federations after joining a new one to keep all metadata fresh
                    dispatch(refreshFederations(fedimint))
                }

                const federationId =
                    'federation_id' in parsedEcash
                        ? parsedEcash.federation_id
                        : joinedFederation?.id

                if (!federationId) {
                    log.error('No federation ID found')
                    throw new Error()
                }

                const result = await dispatch(
                    receiveEcash({
                        fedimint,
                        federationId,
                        ecash: decodeURIComponent(ecashToken),
                    }),
                ).unwrap()

                if (result.status === 'failed') {
                    log.error('ReceiveEcash failed')
                    throw new Error()
                }

                setEcashClaimed(true)
            } catch (e) {
                setIsError(true)
                log.error('Ecash could not be claimed', e)
            } finally {
                setLoading(false)
            }
        },
        [dispatch, fedimint],
    )

    return {
        claimEcash,
        loading,
        claimed,
        isError,
    }
}
