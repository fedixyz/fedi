import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setFederations, setupStore } from '@fedi/common/redux'
import { mockFederationWithSPV2 } from '@fedi/common/tests/mock-data/federation'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '@fedi/common/tests/utils/fedimint'
import { LoadedFederation, Sats } from '@fedi/common/types'
import { ConfirmDepositDialog } from '@fedi/web/src/components/Stability/Deposit/ConfirmDepositDialog'
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
        ) =>
            symbolPosition === 'none'
                ? {
                      formattedSats: `${amount} SATS`,
                      formattedUsd: `${amount}.00`,
                  }
                : {
                      formattedSats: `${amount} SATS`,
                      formattedUsd: `${amount}.00 USD`,
                  },
    }),
}))

jest.mock('@fedi/common/hooks/transactions', () => ({
    useFeeDisplayUtils: () => ({
        makeSPDepositFeeContent: () => ({
            formattedTotalFee: '3 SATS',
        }),
    }),
    useStabilityPoolDepositFeeDetails: () => ({
        fediAppFee: 1000,
        federationFee: 2000,
        networkFee: 0,
    }),
}))

describe('/components/Stability/Deposit/ConfirmDepositDialog', () => {
    const user = userEvent.setup()
    let fedimint: MockFedimintBridge
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        store.dispatch(setFederations([stableFederation]))
        fedimint = createMockFedimintBridge({
            spv2DepositToSeek: 'operation-id',
        })
    })

    it('should show the confirmation amount', () => {
        renderWithProviders(
            <ConfirmDepositDialog
                amount={2000 as Sats}
                federationId={stableFederation.id}
                onOpenChange={jest.fn()}
                onSuccess={jest.fn()}
                open={true}
            />,
            { fedimint, store },
        )

        expect(
            screen.getByRole('dialog', {
                name: i18n.t('feature.stabilitypool.confirm-deposit'),
            }),
        ).toBeInTheDocument()
        expect(screen.getByText('2000.00')).toBeInTheDocument()
        expect(screen.getByText('USD')).toBeInTheDocument()
    })

    it('should show and hide the deposit details', async () => {
        renderWithProviders(
            <ConfirmDepositDialog
                amount={2000 as Sats}
                federationId={stableFederation.id}
                onOpenChange={jest.fn()}
                onSuccess={jest.fn()}
                open={true}
            />,
            { fedimint, store },
        )

        await user.click(
            screen.getByRole('button', {
                name: i18n.t('feature.stabilitypool.details-and-fee'),
            }),
        )

        expect(
            screen.getByText(i18n.t('feature.stabilitypool.deposit-from')),
        ).toBeInTheDocument()
        expect(screen.getByText('2000 SATS')).toBeInTheDocument()
        expect(screen.getByText('2000.00 USD')).toBeInTheDocument()
        expect(screen.getByText('3 SATS')).toBeInTheDocument()
        expect(
            screen.getByText(i18n.t('feature.stabilitypool.deposit-time')),
        ).toBeInTheDocument()

        await user.click(
            screen.getByRole('button', {
                name: i18n.t('phrases.hide-details'),
            }),
        )

        expect(screen.queryByText('2000 SATS')).not.toBeInTheDocument()
    })

    it('should dispatch a stable balance deposit with the selected federation', async () => {
        renderWithProviders(
            <ConfirmDepositDialog
                amount={2000 as Sats}
                federationId={stableFederation.id}
                onOpenChange={jest.fn()}
                onSuccess={jest.fn()}
                open={true}
            />,
            { fedimint, store },
        )

        await user.click(
            screen.getByRole('button', { name: i18n.t('words.deposit') }),
        )

        expect(fedimint.spv2DepositToSeek).toHaveBeenCalledWith(
            2000000,
            stableFederation.id,
        )
    })
})
