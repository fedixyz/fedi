import { waitFor } from '@testing-library/react'

import { useMinMaxSendAmount } from '../../../../hooks/amount'
import {
    selectFederationBalance,
    selectLastUsedFederationId,
    setupStore,
} from '../../../../redux'
import { MSats } from '../../../../types'
import amountUtils from '../../../../utils/AmountUtils'
import { FedimintBridge } from '../../../../utils/fedimint'
import { createIntegrationTestBuilder } from '../../../utils/remote-bridge-setup'
import { renderHookWithBridge } from '../../../utils/render'

describe('useMinMaxSendAmount hook', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    let store: ReturnType<typeof setupStore>
    let fedimint: FedimintBridge

    beforeEach(() => {
        store = context.store
        fedimint = context.bridge.fedimint
    })

    describe('Lightning Invoice', () => {
        it('minimumAmount should be the invoice amount, maximumAmount should be the invoice amount + fees', async () => {
            await builder.withEcashReceived(100_000_000)

            const federationId = selectLastUsedFederationId(store.getState())
            const invoiceStr = await fedimint.generateInvoice(
                30_000_000 as MSats,
                '',
                federationId,
            )
            const invoice = await fedimint.parseInvoice(invoiceStr)
            const invoiceFees = await fedimint.estimateLnFees(
                invoiceStr,
                federationId,
            )

            const { result } = renderHookWithBridge(
                () =>
                    useMinMaxSendAmount({
                        invoice,
                        federationId,
                    }),
                store,
                fedimint,
            )

            const invoiceTotalFees = (invoiceFees.federationFee +
                invoiceFees.fediFee +
                invoiceFees.networkFee) as MSats
            const invoiceTotalAmount = (invoice.amount +
                invoiceTotalFees) as MSats
            const totalAmountSats = amountUtils.msatToSat(invoiceTotalAmount)

            await waitFor(() => {
                expect(result.current.minimumAmount).toBe(
                    amountUtils.msatToSat(invoice.amount),
                )
                expect(result.current.maximumAmount).toBe(totalAmountSats)
            })
        })

        it('the maximum amount should be constrained by the balance', async () => {
            await builder.withEcashReceived(100_000_000)

            const federationId = selectLastUsedFederationId(store.getState())
            const balance = selectFederationBalance(
                store.getState(),
                federationId,
            )
            const invoiceStr = await fedimint.generateInvoice(
                (balance + 30_000_000) as MSats,
                '',
                federationId,
            )
            const invoice = await fedimint.parseInvoice(invoiceStr)

            const { result } = renderHookWithBridge(
                () =>
                    useMinMaxSendAmount({
                        invoice,
                        federationId,
                    }),
                store,
                fedimint,
            )

            await waitFor(() => {
                expect(result.current.minimumAmount).toBe(
                    amountUtils.msatToSat(invoice.amount),
                )
                expect(result.current.maximumAmount).toBe(
                    amountUtils.msatToSat(balance),
                )
            })
        })
    })
})
