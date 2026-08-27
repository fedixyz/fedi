import { cleanup, screen, userEvent } from '@testing-library/react-native'
import React from 'react'

import { setupStore } from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'
import type { Federation, MSats } from '@fedi/common/types'
import i18n from '@fedi/native/localization/i18n'

import { WalletServicePayerRow } from '../../../../../components/feature/walletservice/WalletServicePayerRow'
import { renderWithProviders } from '../../../../utils/render'

const makeState = (federations: Federation[]) => {
    const state = setupStore().getState()
    return {
        environment: {
            ...state.environment,
            transactionDisplayType: 'sats' as const,
        },
        federation: {
            ...state.federation,
            federations,
            payFromFederationId: federations[0]?.id,
        },
    }
}

const renderRow = (
    federations: Federation[],
    allowedFederationIds: string[],
) => {
    const user = userEvent.setup()
    renderWithProviders(
        <WalletServicePayerRow allowedFederationIds={allowedFederationIds} />,
        { preloadedState: makeState(federations) },
    )
    return { user }
}

describe('WalletServicePayerRow', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should name the wallet the setup cost is charged to', async () => {
        renderRow([mockFederation1], [mockFederation1.id])

        expect(await screen.findByText('test-federation')).toBeOnTheScreen()
    })

    it('should offer only the wallets the bridge admits', async () => {
        renderRow([mockFederation1, mockFederation2], [mockFederation2.id])

        expect(await screen.findByText('test-federation-2')).toBeOnTheScreen()
        expect(screen.queryByText('test-federation')).not.toBeOnTheScreen()
    })

    it('should render nothing when no admitted wallet is held', () => {
        renderRow([mockFederation1], ['some-unheld-federation'])

        expect(screen.queryByTestId('wallet-service-payer-row')).toBeNull()
    })

    it('should open the picker when more than one wallet is admitted', async () => {
        const { user } = renderRow(
            [mockFederation1, mockFederation2],
            [mockFederation1.id, mockFederation2.id],
        )

        await user.press(await screen.findByTestId('wallet-service-payer-row'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.select-payer-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByTestId(
                `WalletServicePayerOption-${mockFederation1.id}`,
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByTestId(
                `WalletServicePayerOption-${mockFederation2.id}`,
            ),
        ).toBeOnTheScreen()
    })

    // the reason to open this sheet is that the selected wallet cannot cover
    // the cost, so the one most likely to must not be buried under empty ones
    it('should list the best funded wallet first', async () => {
        const broke = { ...mockFederation1, balance: 0 as MSats }
        const funded = { ...mockFederation2, balance: 900_000 as MSats }
        const { user } = renderRow([broke, funded], [broke.id, funded.id])

        await user.press(await screen.findByTestId('wallet-service-payer-row'))

        const options = await screen.findAllByTestId(
            /^WalletServicePayerOption-/,
        )
        expect(options.map(o => o.props.testID)).toEqual([
            `WalletServicePayerOption-${funded.id}`,
            `WalletServicePayerOption-${broke.id}`,
        ])
    })

    it('should say what the picker is choosing a payer for', async () => {
        const { user } = renderRow(
            [mockFederation1, mockFederation2],
            [mockFederation1.id, mockFederation2.id],
        )

        await user.press(await screen.findByTestId('wallet-service-payer-row'))

        expect(
            await screen.findByText(/Choose an eligible Wallet Service to pay/),
        ).toBeOnTheScreen()
    })

    it('should not offer a choice when only one wallet is admitted', async () => {
        const { user } = renderRow([mockFederation1], [mockFederation1.id])

        await user.press(await screen.findByTestId('wallet-service-payer-row'))

        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.select-payer-title'),
            ),
        ).not.toBeOnTheScreen()
    })
})
