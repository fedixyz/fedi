import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setFederations, setupStore } from '@fedi/common/redux'
import { mockFederationWithSPV2 } from '@fedi/common/tests/mock-data/federation'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import { LoadedFederation, Sats, UsdCents } from '@fedi/common/types'
import { ConfirmWithdrawDialog } from '@fedi/web/src/components/Stability/Withdraw/ConfirmWithdrawDialog'
import i18n from '@fedi/web/src/localization/i18n'
import { renderWithProviders } from '@fedi/web/tests/utils/render'

const stableFederation: LoadedFederation = {
    ...mockFederationWithSPV2,
    clientConfig: {
        global: {},
        modules: {
            multi_sig_stability_pool: {
                kind: 'multi_sig_stability_pool',
                min_allowed_seek: 1000,
                max_allowed_provide_fee_rate_ppb: 0,
                min_allowed_cancellation_bps: 0,
                cycle_duration: { secs: 600, nanos: 0 },
            },
        },
    },
}

jest.mock('@fedi/common/hooks/amount', () => ({
    useAmountFormatter: () => ({
        makeFormattedAmountsFromSats: (
            amount: number,
            symbolPosition: 'end' | 'none',
        ) => ({
            formattedUsd:
                symbolPosition === 'none' ? `${amount}.00` : `${amount}.00 USD`,
        }),
    }),
    useBtcFiatPrice: () => ({
        convertCentsToFormattedFiat: (
            amount: number,
            symbolPosition: 'end' | 'none',
        ) =>
            symbolPosition === 'none'
                ? `${amount / 100}.00`
                : `${amount / 100}.00 USD`,
    }),
}))

describe('/components/Stability/Withdraw/ConfirmWithdrawDialog', () => {
    const user = userEvent.setup()
    let fedimint: MockFedimintBridge
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        store.dispatch(setFederations([stableFederation]))
        fedimint = createMockFedimintBridge()
    })

    it('should show the confirmation amount', () => {
        renderWithProviders(
            <ConfirmWithdrawDialog
                amountSats={2000 as Sats}
                amountCents={200 as UsdCents}
                federationId={stableFederation.id}
                onOpenChange={jest.fn()}
                onSuccess={jest.fn()}
                open={true}
            />,
            { fedimint, store },
        )

        expect(
            screen.getByRole('dialog', {
                name: i18n.t('feature.stabilitypool.confirm-withdrawal'),
            }),
        ).toBeInTheDocument()
        expect(screen.getByText('2.00')).toBeInTheDocument()
        expect(screen.getByText('USD')).toBeInTheDocument()
    })

    it('should show and hide the withdraw details', async () => {
        renderWithProviders(
            <ConfirmWithdrawDialog
                amountSats={2000 as Sats}
                amountCents={200 as UsdCents}
                federationId={stableFederation.id}
                onOpenChange={jest.fn()}
                onSuccess={jest.fn()}
                open={true}
            />,
            { fedimint, store },
        )

        await user.click(
            screen.getByRole('button', {
                name: i18n.t('words.details'),
            }),
        )

        expect(
            screen.getByText(i18n.t('feature.stabilitypool.withdraw-to')),
        ).toBeInTheDocument()
        expect(screen.getByText(i18n.t('words.fees'))).toBeInTheDocument()
        expect(
            screen.getByText(i18n.t('feature.stabilitypool.withdrawal-time')),
        ).toBeInTheDocument()

        await user.click(
            screen.getByRole('button', {
                name: i18n.t('phrases.hide-details'),
            }),
        )

        expect(
            screen.queryByText(i18n.t('feature.stabilitypool.withdraw-to')),
        ).not.toBeInTheDocument()
    })
})
