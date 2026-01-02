/**
 * Tests for onboarding flow with remote bridge
 * Testing onboarding status updates and state management
 */
import { act, waitFor } from '@testing-library/react'
import i18next from 'i18next'

import {
    useMakeLightningRequest,
    useMakeOnchainAddress,
    useLnurlReceiveCode,
} from '../../../hooks/receive'
import { selectLastUsedFederationId } from '../../../redux'
import { MSats, ParsedLnurlPay, ParserDataType, Sats } from '../../../types'
import { RpcTransaction } from '../../../types/bindings'
import { lnurlPay } from '../../../utils/lnurl'
import { parseUserInput } from '../../../utils/parser'
import { createIntegrationTestBuilder } from '../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../utils/render'

describe('common/hooks/receive', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    describe('useMakeLightningRequest', () => {
        it('should create a 1000 sat invoice and hide loader when ready', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () =>
                    useMakeLightningRequest({
                        federationId,
                    }),
                store,
                fedimint,
            )

            // Make the lightning request
            await act(() =>
                result.current.makeLightningRequest(1000 as Sats, 'test'),
            )

            // Wait for an invoice
            await waitFor(() => {
                expect(result.current.invoice).toBeTruthy()
                expect(result.current.isInvoiceLoading).toBeFalsy()
            })
        })

        it('should invoke an error if creating the lightning invoice fails', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () =>
                    useMakeLightningRequest({
                        federationId,
                    }),
                store,
                fedimint,
            )

            act(() => {
                // Make the lightning request
                const invoiceResult = result.current.makeLightningRequest(
                    -1000 as Sats,
                    'test',
                )

                expect(invoiceResult).rejects.toThrow()
            })
        })

        it('should fire the listener callback when the invoice has been paid', async () => {
            await builder.withEcashReceived(10000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const onInvoicePaid = jest.fn()

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () =>
                    useMakeLightningRequest({
                        federationId,
                        onInvoicePaid,
                    }),
                store,
                fedimint,
            )

            // Make the lightning request
            await act(() =>
                result.current.makeLightningRequest(1 as Sats, 'test'),
            )

            // Wait for an invoice
            await waitFor(() => {
                expect(result.current.invoice).toBeTruthy()
            })

            // Pay the invoice
            await fedimint.payInvoice(
                result.current.invoice || '',
                federationId || '',
            )

            await waitFor(() => {
                expect(onInvoicePaid).toHaveBeenCalled()
            })
        })
    })

    describe('useMakeOnchainAddress', () => {
        it('should create an onchain address and hide loader when ready', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () =>
                    useMakeOnchainAddress({
                        federationId,
                    }),
                store,
                fedimint,
            )

            // Make the onchain address
            await act(() => result.current.makeOnchainAddress())

            // Wait for the address
            await waitFor(() => {
                expect(result.current.address).toBeTruthy()
            })
        })

        it('should add transaction notes', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () => useMakeOnchainAddress({ federationId }),
                store,
                fedimint,
            )

            // Make an onchain address
            await act(() => result.current.makeOnchainAddress())

            // Wait for the address and its respective transaction ID
            await waitFor(() => {
                expect(result.current.address).toBeDefined()
                expect(result.current.transaction).toBeDefined()
            })

            // Save notes
            await act(() => result.current.onSaveNotes('test notes'))

            // Fetch the transaction by its ID and ensure that notes match
            await waitFor(async () => {
                expect(result.current.transaction).toBeDefined()

                const transaction = await fedimint.getTransaction(
                    federationId || '',
                    result.current.transaction?.id || '',
                )

                expect(transaction.txnNotes).toBe('test notes')
            })
        })

        it('should throw if making an onchain address fails', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const { result } = renderHookWithBridge(
                () =>
                    useMakeOnchainAddress({
                        federationId: 'invalid federation id',
                    }),
                store,
                fedimint,
            )

            // Make the onchain address
            act(() => {
                const onchainAddressResult = result.current.makeOnchainAddress()

                expect(onchainAddressResult).rejects.toThrow(
                    'Federation not found',
                )
            })
        })

        it('should throw if saving notes fails', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () =>
                    useMakeOnchainAddress({
                        federationId,
                    }),
                store,
                fedimint,
            )

            // Make an onchain address
            await act(() => result.current.makeOnchainAddress())

            // Wait for the address and its respective transaction ID
            await waitFor(() => {
                expect(result.current.address).toBeDefined()
                expect(result.current.transaction).toBeDefined()
            })

            // Save notes
            const saveNotesResult = result.current.onSaveNotes({
                this: 'is a test',
            } as unknown as string)

            expect(saveNotesResult).rejects.toThrow('Bad request')
        })
    })

    describe('useLnurlReceiveCode', () => {
        it('should generate an LNURL receive code', async () => {
            await builder.withFederationJoined()

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () => useLnurlReceiveCode(federationId || ''),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.supportsLnurl).toBeTruthy()
                expect(result.current.lnurlReceiveCode).toBeTruthy()
                expect(result.current.isLoading).toBeFalsy()
            })
        })

        it('should receive funds to an LNURL receive code', async () => {
            await builder.withEcashReceived(100000)

            const {
                store,
                bridge: { fedimint },
            } = context

            const federationId = selectLastUsedFederationId(store.getState())
            const { result } = renderHookWithBridge(
                () => useLnurlReceiveCode(federationId || ''),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.supportsLnurl).toBeTruthy()
                expect(result.current.lnurlReceiveCode).toBeTruthy()
                expect(result.current.isLoading).toBeFalsy()
            })

            // Parse the lnurl pay code
            const parsedLnurl = (await parseUserInput(
                result.current.lnurlReceiveCode ?? '',
                fedimint,
                i18next.t,
                federationId,
                false,
            )) as ParsedLnurlPay

            expect(parsedLnurl.type).toBe(ParserDataType.LnurlPay)

            // Pay the parsed lnurl pay code
            const payResult = await lnurlPay(
                fedimint,
                federationId ?? '',
                parsedLnurl.data,
                10000 as MSats,
                'lnurl pay txn',
            )

            expect(payResult.isOk()).toBeTruthy()
            expect(payResult._unsafeUnwrap().preimage).toBeTruthy()

            // find the transaction
            const transactions = await fedimint.listTransactions(
                federationId ?? '',
            )
            const refinedTransactions = transactions
                .filter(entry => 'Ok' in entry)
                .map(entry => entry.Ok)

            // Lightning transaction used to pay the lnurl receive code
            const lnPayTxn = refinedTransactions.find(
                tx => tx.kind === 'lnPay' && tx.txnNotes === 'lnurl pay txn',
            )

            const lnurlClaimedTxn = await new Promise<RpcTransaction>(
                resolve => {
                    const unsubscribe = fedimint.addListener(
                        'transaction',
                        event => {
                            if (
                                event.transaction.kind ===
                                    'lnRecurringdReceive' &&
                                event.transaction.amount === 10000 &&
                                event.transaction.state?.type === 'claimed'
                            ) {
                                unsubscribe()
                                resolve(event.transaction)
                            }
                        },
                    )
                },
            )

            expect(lnPayTxn).toBeTruthy()
            expect(lnPayTxn?.state?.type).toBe('success')
            expect(lnurlClaimedTxn).toBeTruthy()
        })
    })
})
