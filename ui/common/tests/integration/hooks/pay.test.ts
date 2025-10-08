import { act, waitFor } from '@testing-library/react'
import i18next from 'i18next'

import { useOmniPaymentState, useSendEcash } from '../../../hooks/pay'
import { selectLastUsedFederationId } from '../../../redux'
import {
    MSats,
    ParsedBitcoinAddress,
    ParsedBolt11,
    ParsedLnurlPay,
    Sats,
} from '../../../types'
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
                () => useOmniPaymentState(fedimint, federationId, i18next.t),
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
                () => useOmniPaymentState(fedimint, federationId, i18next.t),
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
                expect('txid' in res && res.txid).toBeTruthy()
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
                () => useOmniPaymentState(fedimint, federationId, i18next.t),
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
                () => useSendEcash(fedimint, federationId || ''),
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
            const decoded = await fedimint.validateEcash(
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
})
