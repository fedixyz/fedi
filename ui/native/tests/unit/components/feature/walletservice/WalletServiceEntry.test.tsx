import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import { setFiStatus, setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { RpcFiFormationSnapshot } from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import { WalletServiceEntry } from '../../../../../components/feature/walletservice/WalletServiceEntry'
import { mockNavigation, mockToast } from '../../../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../../../utils/render'

const makeFormation = (
    overrides: Partial<RpcFiFormationSnapshot> = {},
): RpcFiFormationSnapshot => ({
    formationId: 'formation-1',
    phase: 'acquiringSeats',
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort',
        fedimintdVersion: '0.11.1-fedi13',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: false,
    milestones: {
        ecashSent: false,
        guardiansConfirmed: false,
        walletServiceCreated: false,
    },
    inviteCode: null,
    lastError: null,
    ...overrides,
})

// no WalletServiceMonitor is mounted around a bare component render, so the fi
// status has to be seeded by hand. Leaving it unseeded is the startup window.
const makeStore = (status?: Parameters<typeof setFiStatus>[0]) => {
    const store = setupStore()
    if (status) store.dispatch(setFiStatus(status))
    return store
}

const renderEntry = ({
    store = makeStore({ type: 'idle' }),
}: { store?: ReturnType<typeof setupStore> } = {}) => {
    const user = userEvent.setup()
    // stubbed so "was never called" is a real assertion rather than a check
    // against an undefined property. The entry must not reach for it at all.
    const fedimint = createMockFedimintBridge({
        fiClientEligiblePayers: () =>
            Promise.resolve({ type: 'payers', payers: [] }),
    })

    renderWithProviders(<WalletServiceEntry />, { store, fedimint })

    return { user, fedimint }
}

const pressCreate = async (user: ReturnType<typeof userEvent.setup>) =>
    user.press(
        await screen.findByRole('button', { name: i18n.t('words.create') }),
    )

// once a service is formed the CTA manages it rather than offering a second
const pressManage = async (user: ReturnType<typeof userEvent.setup>) =>
    user.press(
        await screen.findByRole('button', {
            name: i18n.t('feature.wallet-service.manage-wallet-service'),
        }),
    )

describe('WalletServiceEntry', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should label the primary action "Create"', async () => {
        renderEntry()

        expect(
            await screen.findByRole('button', { name: i18n.t('words.create') }),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.onboarding.create-button-label'),
            ),
        ).not.toBeOnTheScreen()
    })

    it('should keep the action labelled while the fi status is unknown', async () => {
        renderEntry({ store: makeStore() })

        expect(
            await screen.findByRole('button', { name: i18n.t('words.create') }),
        ).toBeOnTheScreen()
    })

    it('should not route while the fi status is unknown', async () => {
        const { user } = renderEntry({ store: makeStore() })

        await pressCreate(user)

        expect(mockNavigation.navigate).not.toHaveBeenCalled()
    })

    // the 23 July decision: no hindrance on federation membership until the
    // payment screen. The entry must not ask who can pay, so a user in no
    // trusted setup payment federation reaches the price like anyone else.
    it('should continue to the guardian set whatever the membership', async () => {
        const { user, fedimint } = renderEntry()

        await pressCreate(user)

        await waitFor(() => {
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'CreateWalletService',
            )
        })
        expect(mockNavigation.navigate).toHaveBeenCalledTimes(1)
        expect(fedimint.fiClientEligiblePayers).not.toHaveBeenCalled()
        expect(mockToast.show).not.toHaveBeenCalled()
    })

    it('should resume an existing service instead of starting a new one', async () => {
        const { user } = renderEntry({
            store: makeStore({
                type: 'formation',
                formation: makeFormation({ phase: 'formed' }),
            }),
        })

        // a user may only have one Wallet Service, so the CTA must not offer
        // to create a second one
        expect(
            screen.queryByRole('button', { name: i18n.t('words.create') }),
        ).not.toBeOnTheScreen()

        await pressManage(user)

        await waitFor(() => {
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceDashboard',
            )
        })
        expect(mockNavigation.navigate).toHaveBeenCalledTimes(1)
    })

    it('should resume a formation that is still being built', async () => {
        const { user } = renderEntry({
            store: makeStore({
                type: 'formation',
                formation: makeFormation({ phase: 'acquiringSeats' }),
            }),
        })

        await pressCreate(user)

        await waitFor(() => {
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceProgress',
            )
        })
        expect(mockNavigation.navigate).toHaveBeenCalledTimes(1)
    })
})
