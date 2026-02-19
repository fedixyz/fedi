import { waitFor } from '@testing-library/react'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'
import { renderHookWithBridge } from '@fedi/common/tests/utils/render'

import { useLightningInvoiceAmount } from '../../../../hooks/amount/useLightningInvoiceAmount'
import { selectLastUsedFederationId } from '../../../../redux'
import { MSats } from '../../../../types'
import amountUtils from '../../../../utils/AmountUtils'

describe('useLightningInvoiceAmount hook', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('returns an amount greater than the amount of the generated invoice (includes fees)', async () => {
        await builder.withEcashReceived(100_000_000)

        const {
            store,
            bridge: { fedimint },
        } = context

        const federationId = selectLastUsedFederationId(store.getState())

        expect(federationId).toBeTruthy()

        const invoiceString = await fedimint.generateInvoice(
            50_000_000 as MSats,
            'memo',
            federationId,
        )
        const invoice = await fedimint.parseInvoice(invoiceString)
        const invoiceSats = amountUtils.msatToSat(invoice.amount)

        const { result } = renderHookWithBridge(
            () => useLightningInvoiceAmount(invoice, federationId),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(result.current).toBeGreaterThan(invoiceSats)
        })
    })
})
