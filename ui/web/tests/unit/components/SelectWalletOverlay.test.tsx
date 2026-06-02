import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    selectCurrency,
    selectPaymentType,
    selectSelectedFederation,
    setFeatureFlags,
    setFederations,
    setSimulateRecovery,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { LoadedFederation } from '@fedi/common/types'
import { FeatureCatalog } from '@fedi/common/types/bindings'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import SelectWalletOverlay from '../../../src/components/SelectWalletOverlay'
import i18n from '../../../src/localization/i18n'
import { renderWithProviders } from '../../utils/render'

describe('SelectWalletOverlay', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()
    const featureFlags = {
        show_stable_balance_web: {},
    } as FeatureCatalog

    beforeEach(() => {
        store = setupStore()
        store.dispatch(setFeatureFlags(featureFlags))
    })

    it("should switch the selected federation and payment type when a federation's bitcoin balance is selected", async () => {
        const onOpenChange = jest.fn()
        store.dispatch(setFederations([mockFederation1]))

        renderWithProviders(
            <SelectWalletOverlay open={true} onOpenChange={onOpenChange} />,
            { store },
        )

        const bitcoinButton = screen.getByRole('button', {
            name: new RegExp(i18n.t('words.bitcoin'), 'i'),
        })

        await user.click(bitcoinButton)

        expect(selectPaymentType(store.getState())).toBe('bitcoin')
        expect(selectSelectedFederation(store.getState())).toStrictEqual(
            mockFederation1,
        )
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("should switch the selected federation and payment type when a federation's stable balance is selected", async () => {
        const onOpenChange = jest.fn()
        const federationWithStableBalance = {
            ...mockFederation1,
            meta: { 'fedi:stability_pool_disabled': 'false' },
        } as LoadedFederation

        store.dispatch(setFederations([federationWithStableBalance]))
        const currencyCode = getCurrencyCode(
            selectCurrency(store.getState(), federationWithStableBalance.id),
        )

        renderWithProviders(
            <SelectWalletOverlay open={true} onOpenChange={onOpenChange} />,
            { store },
        )

        const stableBalanceButton = screen.getByRole('button', {
            name: new RegExp(`^${currencyCode}\\b`, 'i'),
        })

        await user.click(stableBalanceButton)

        expect(selectPaymentType(store.getState())).toBe('stable-balance')
        expect(selectSelectedFederation(store.getState())).toStrictEqual(
            federationWithStableBalance,
        )
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('should not show the stable balance button when the federation does not support stable balance', () => {
        store.dispatch(setFederations([mockFederation1]))
        const currencyCode = getCurrencyCode(
            selectCurrency(store.getState(), mockFederation1.id),
        )

        renderWithProviders(
            <SelectWalletOverlay open={true} onOpenChange={() => {}} />,
            { store },
        )

        expect(
            screen.queryByRole('button', {
                name: new RegExp(`^${currencyCode}\\b`, 'i'),
            }),
        ).not.toBeInTheDocument()
    })

    it('should hide balance buttons for a recovering federation', () => {
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(
            setSimulateRecovery({
                federationId: mockFederation1.id,
                enabled: true,
            }),
        )

        renderWithProviders(
            <SelectWalletOverlay open={true} onOpenChange={() => {}} />,
            { store },
        )

        expect(
            screen.queryByRole('button', {
                name: new RegExp(i18n.t('words.bitcoin'), 'i'),
            }),
        ).not.toBeInTheDocument()
    })
})
