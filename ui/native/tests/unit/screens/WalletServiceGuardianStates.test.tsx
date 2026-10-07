import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'

import {
    refreshGuardianStatuses,
    setFederations,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { GuardianStatus } from '@fedi/common/types/bindings'
import * as environment from '@fedi/common/utils/environment'

import WalletServiceGuardianStates from '../../../screens/developer/WalletServiceGuardianStates'
import { renderWithProviders } from '../../utils/render'

const federation = {
    ...mockFederation1,
    nodes: Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [
            index,
            { name: `node-${index}`, url: `wss://guardian-${index}.example` },
        ]),
    ),
}

const responding = (guardians: GuardianStatus[] | undefined) =>
    guardians?.filter(g => 'online' in g).length

describe('WalletServiceGuardianStates', () => {
    beforeEach(() => {
        jest.spyOn(environment, 'isDev').mockReturnValue(true)
    })

    afterEach(() => {
        cleanup()
        jest.restoreAllMocks()
    })

    const renderToggles = () => {
        const store = setupStore()
        renderWithProviders(
            <WalletServiceGuardianStates federation={federation} />,
            { store },
        )
        const simulated = () =>
            store.getState().federation.guardianHealthSimulation[federation.id]
        return { simulated }
    }

    const toggle = (label: string, value: boolean) =>
        fireEvent(screen.getByLabelText(label), 'valueChange', value)

    it.each([
        ['All online', 10],
        ['One not responding', 9],
        ['Offline', 6],
    ])('should force %s with named guardians', (label, expectedResponding) => {
        const { simulated } = renderToggles()

        toggle(label, true)

        expect(responding(simulated()?.guardians)).toBe(expectedResponding)
        expect(simulated()?.mode).toBe('sustained')
        expect(
            simulated()?.guardians.every(
                g => Object.values(g)[0].fman_name !== null,
            ),
        ).toBe(true)
    })

    it('should force every guardian online without a name', () => {
        const { simulated } = renderToggles()

        toggle('Names missing', true)

        expect(responding(simulated()?.guardians)).toBe(10)
        expect(
            simulated()?.guardians.every(
                g => Object.values(g)[0].fman_name === null,
            ),
        ).toBe(true)
    })

    it('should turn the other states off when one is turned on', () => {
        renderToggles()

        toggle('Offline', true)
        toggle('One not responding', true)

        expect(screen.getByLabelText('One not responding')).toHaveProp(
            'value',
            true,
        )
        expect(screen.getByLabelText('Offline')).toHaveProp('value', false)
    })

    it('should return to the real connection when the active state is turned off', () => {
        const { simulated } = renderToggles()

        toggle('Offline', true)
        toggle('Offline', false)

        expect(simulated()).toBeUndefined()
    })

    it('should use the checked guardians when the federation lists no nodes', async () => {
        const store = setupStore()
        const withoutNodes = { ...federation, nodes: {} }
        const checked: GuardianStatus[] = ['a', 'b', 'c', 'd'].map(name => ({
            online: {
                guardian: `wss://${name}.example`,
                fman_name: null,
                latency_ms: 1,
            },
        }))
        store.dispatch(setFederations([withoutNodes]))
        await act(async () => {
            await store.dispatch(
                refreshGuardianStatuses({
                    fedimint: createMockFedimintBridge({
                        getGuardianStatus: async () => checked,
                    }),
                    federation: withoutNodes,
                }),
            )
        })
        renderWithProviders(
            <WalletServiceGuardianStates federation={withoutNodes} />,
            { store },
        )

        toggle('One not responding', true)

        const simulated =
            store.getState().federation.guardianHealthSimulation[federation.id]
        expect(
            simulated?.guardians.map(g => Object.values(g)[0].guardian),
        ).toEqual(checked.map(g => Object.values(g)[0].guardian))
        expect(responding(simulated?.guardians)).toBe(3)
    })

    it('should not render outside dev and nightly builds', () => {
        jest.spyOn(environment, 'isDev').mockReturnValue(false)
        jest.spyOn(environment, 'isNightly').mockReturnValue(false)

        renderToggles()

        expect(screen.queryByLabelText('Offline')).not.toBeOnTheScreen()
    })
})
