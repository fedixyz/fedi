import { act, waitFor } from '@testing-library/react'
import i18next from 'i18next'

import {
    useOmniPaymentState,
    useParseEcash,
    useSendEcash,
} from '../../../hooks/pay'
import {
    leaveFederation,
    selectLastUsedFederation,
    selectLastUsedFederationId,
    upsertFederation,
} from '../../../redux'
import {
    LoadedFederation,
    MSats,
    ParsedBitcoinAddress,
    ParsedBolt11,
    ParsedLnurlPay,
    Sats,
} from '../../../types'
import { RpcFederationPreview } from '../../../types/bindings'
import amountUtils from '../../../utils/AmountUtils'
import { parseUserInput } from '../../../utils/parser'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('sending payments', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    describe('useOmniPaymentState', () => {
        it('should parse and pay a lightning invoice', async () => {
            await builder.withEcashReceived(10000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () => useOmniPaymentState(federationId, i18next.t),
                store,
                fedimint,
            )

            const invoice = await fedimint.generateInvoice(
                1000 as MSats,
                'memo',
                federationId ?? '',
            )

            // Parse the invoice into ParsedData
            const parsedData = (await parseUserInput(
                invoice,
                fedimint,
                i18next.t,
                federationId,
                false,
            )) as ParsedBolt11
            const amountSats = amountUtils.msatToSat(parsedData.data.amount)

            // Handle the parsed data
            await act(() => result.current.handleOmniInput(parsedData))

            // Pay the invoice using handleOmniSend
            await act(async () => {
                const res = await result.current.handleOmniSend(amountSats)
                expect('preimage' in res && res.preimage).toBeTruthy()
            })

            const lastUsedFederationId = selectLastUsedFederationId(
                store.getState(),
            )
            expect(lastUsedFederationId).toEqual(federationId)
        })

        it('should parse and pay an onchain address', async () => {
            await builder.withEcashReceived(10000000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () => useOmniPaymentState(federationId, i18next.t),
                store,
                fedimint,
            )

            const address = await fedimint.generateAddress(federationId ?? '')

            // Parse the invoice into ParsedData
            const parsedData = (await parseUserInput(
                address,
                fedimint,
                i18next.t,
                federationId,
                false,
            )) as ParsedBitcoinAddress

            // Handle the parsed data
            await act(() => result.current.handleOmniInput(parsedData))

            // Pay the invoice using handleOmniSend
            await act(async () => {
                const res = await result.current.handleOmniSend(1000 as Sats)
                expect(res).toBeDefined()
            })

            const lastUsedFederationId = selectLastUsedFederationId(
                store.getState(),
            )
            expect(lastUsedFederationId).toEqual(federationId)
        })

        it('should parse and pay an lnurl receive code', async () => {
            await builder.withEcashReceived(10000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () => useOmniPaymentState(federationId, i18next.t),
                store,
                fedimint,
            )

            const lnurlReceiveCode = await fedimint.getRecurringdLnurl(
                federationId ?? '',
            )

            const parsedData = (await parseUserInput(
                lnurlReceiveCode,
                fedimint,
                i18next.t,
                federationId,
                false,
            )) as ParsedLnurlPay

            // Handle the parsed data
            await act(() => result.current.handleOmniInput(parsedData))

            // Pay the invoice using handleOmniSend
            await act(async () => {
                const res = await result.current.handleOmniSend(1 as Sats)
                expect('preimage' in res && res.preimage).toBeTruthy()
            })

            const lastUsedFederationId = selectLastUsedFederationId(
                store.getState(),
            )
            expect(lastUsedFederationId).toEqual(federationId)
        })
    })

    describe('useSendEcash', () => {
        it('should generate ecash notes', async () => {
            await builder.withEcashReceived(10000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () => useSendEcash(federationId || ''),
                store,
                fedimint,
            )

            // Generate 2 sats of ecash notes
            await act(() => result.current.generateEcash(2 as Sats))

            // Wait for it to finish
            await waitFor(() => {
                expect(result.current.operationId).toBeTruthy()
                expect(result.current.notes).toBeTruthy()
                expect(result.current.isGeneratingEcash).toBeFalsy()
            })

            // Check that the notes are valid by decoding them
            const decoded = await fedimint.parseEcash(
                result.current.notes || '',
            )

            // Check that the amounts match
            expect(decoded.amount).toBe(amountUtils.satToMsat(2 as Sats))

            const lastUsedFederationId = selectLastUsedFederationId(
                store.getState(),
            )
            expect(lastUsedFederationId).toEqual(federationId)
        })
    })

    describe('useParseEcash', () => {
        it('should successfully parse an ecash token', async () => {
            await builder.withEcashReceived(10000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())

            const { result } = renderHookWithBridge(
                () => useSendEcash(federationId || ''),
                store,
                fedimint,
            )

            await act(() => result.current.generateEcash(2 as Sats))
            await waitFor(() => expect(result.current.notes).toBeTruthy())

            const { result: parseEcashResult } = renderHookWithBridge(
                () => useParseEcash(),
                store,
                fedimint,
            )

            await act(() =>
                parseEcashResult.current.parseEcash(
                    result.current.notes as string,
                ),
            )

            await waitFor(() => {
                expect(parseEcashResult.current.parsed).toBeTruthy()
                expect(parseEcashResult.current.ecashToken).toBeTruthy()
                expect(parseEcashResult.current.loading).toBeFalsy()
            })
        })

        it('should get the federation preview if the ecash token includes an invite code', async () => {
            await builder.withEcashReceived(10000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const federation = selectLastUsedFederation(
                store.getState(),
            ) as LoadedFederation

            const { result } = renderHookWithBridge(
                () => useSendEcash(federation.id || ''),
                store,
                fedimint,
            )

            // Manually force the federation to include invite codes in generated ecash tokens
            act(() =>
                store.dispatch(
                    upsertFederation({
                        ...federation,
                        meta: {
                            ...federation.meta,
                            invite_codes_disabled: 'false',
                        },
                    }),
                ),
            )

            await act(() => result.current.generateEcash(2 as Sats))
            await waitFor(() => expect(result.current.notes).toBeTruthy())

            // Leave the federation to force useParseEcash to fetch a federation preview
            await act(() =>
                store.dispatch(
                    leaveFederation({ fedimint, federationId: federation.id }),
                ),
            )

            const { result: parseEcashResult } = renderHookWithBridge(
                () => useParseEcash(),
                store,
                fedimint,
            )

            await act(() =>
                parseEcashResult.current.parseEcash(
                    result.current.notes as string,
                ),
            )

            await waitFor(() => {
                expect(
                    'returningMemberStatus' in
                        (parseEcashResult.current
                            .federation as RpcFederationPreview),
                ).toBeTruthy()
            })
        })
    })
})
