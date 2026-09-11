import {
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react-native'
import React from 'react'

import { attachFiDevTools } from '@fedi/common/devtools/fi'

import WalletServiceDevTools from '../../../../screens/developer/WalletServiceDevTools'
import { mockNavigation } from '../../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../../utils/render'

const memoryStorage = () => {
    const items: Record<string, string> = {}
    return {
        getItem: jest.fn(async (key: string) => items[key] ?? null),
        setItem: jest.fn(async (key: string, value: string) => {
            items[key] = value
        }),
        removeItem: jest.fn(async (key: string) => {
            delete items[key]
        }),
    }
}

const render = (tools: ReturnType<typeof attachFiDevTools>) =>
    renderWithProviders(
        <WalletServiceDevTools tools={tools} navigation={mockNavigation} />,
    )

describe('WalletServiceDevTools', () => {
    beforeEach(() => {
        mockNavigation.navigate.mockClear()
    })

    it('should update the simulator switch and tell the developer to relaunch', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        render(tools)

        fireEvent.press(screen.getByText('Off'))

        await screen.findByText(
            'Quit and relaunch the app to apply the simulator switch.',
        )
        expect(tools.getSwitches().simulator).toBe('off')
    })

    it('should not ask for a relaunch when only the payer source changes', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        render(tools)

        fireEvent.press(screen.getByText('None'))

        expect(tools.getSwitches().payerSource).toBe('none')
        expect(screen.queryByText(/Quit and relaunch/)).toBeNull()
    })

    it('should seed the mock wallets into redux when the payer source becomes mock', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        await tools.setSwitches({ simulator: 'on', payerSource: 'none' })
        const { store } = render(tools)

        fireEvent.press(screen.getByText('Mock'))

        await waitFor(() =>
            expect(tools.getSwitches().payerSource).toBe('mock'),
        )
        expect(store.getState().federation.federations.length).toBeGreaterThan(
            0,
        )
    })

    it('should remove the mock wallets from redux when the payer source leaves mock', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        const { store } = render(tools)

        fireEvent.press(screen.getByText('Mock'))
        fireEvent.press(screen.getByText('Real'))

        await waitFor(() =>
            expect(tools.getSwitches().payerSource).toBe('real'),
        )
        expect(store.getState().federation.federations).toHaveLength(0)
    })

    it('should jump to the chosen screen and navigate to its route', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        const jumpTo = jest.spyOn(tools, 'jumpTo')
        render(tools)

        fireEvent.press(screen.getByText('Go to screen'))
        // "Formation" also names a scenario group further down the panel,
        // so scope to the go-to-screen section to press the right one
        const goToScreen = within(screen.getByTestId('go-to-screen-section'))
        fireEvent.press(goToScreen.getByText('Formation'))
        fireEvent.press(goToScreen.getByText('Progress: DKG underway'))

        await waitFor(() =>
            expect(jumpTo).toHaveBeenCalledWith('formation.dkgUnderway'),
        )
        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceProgress',
        )
    })

    it('should cancel a running script when the simulated state is cleared', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        const cancel = jest.spyOn(tools.player, 'cancel')
        render(tools)

        fireEvent.press(screen.getByText('Simulator tools'))
        fireEvent.press(
            screen.getByText('Clear simulated wallet service state'),
        )

        expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('should cancel a running script when a knob scenario is picked', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        const cancel = jest.spyOn(tools.player, 'cancel')
        render(tools)

        // Baseline holds the default scenario, so it starts open
        fireEvent.press(screen.getByText('slowNetwork'))

        expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('should disable Go to screen while the simulator is off', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        await tools.setSwitches({ ...tools.getSwitches(), simulator: 'off' })
        render(tools)

        fireEvent.press(screen.getByText('Go to screen'))

        const goToScreen = within(screen.getByTestId('go-to-screen-section'))
        expect(goToScreen.queryByText('Formation')).toBeNull()
        expect(
            goToScreen.getByText('Turn the simulator on to jump to a screen.'),
        ).toBeTruthy()
    })
})
