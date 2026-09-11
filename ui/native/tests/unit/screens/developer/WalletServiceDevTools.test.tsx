import {
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react-native'
import React from 'react'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import { attachFiDevTools, FI_DEV_SWITCHES_KEY } from '../../../../devtools/fi'
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

// the simulator defaults off so appium boots clean; the pickers need it on
const simulatorOnStorage = () => {
    const storage = memoryStorage()
    storage.setItem(
        FI_DEV_SWITCHES_KEY,
        JSON.stringify({ simulator: 'on', payerSource: 'mock' }),
    )
    return storage
}

const render = (
    tools: ReturnType<typeof attachFiDevTools>,
    fedimint = createMockFedimintBridge(),
) =>
    renderWithProviders(
        <WalletServiceDevTools tools={tools} navigation={mockNavigation} />,
        { fedimint },
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
        const tools = attachFiDevTools(jest.fn(), simulatorOnStorage())
        await tools.ready
        const jumpTo = jest.spyOn(tools, 'jumpTo')
        render(tools)

        fireEvent.press(screen.getByText('Go to screen'))
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

    it('should prepare the payment before navigating to a confirm screen', async () => {
        const tools = attachFiDevTools(jest.fn(), simulatorOnStorage())
        await tools.ready
        const fedimint = createMockFedimintBridge({
            fiClientPreviewSelection: () =>
                Promise.resolve({
                    type: 'preview',
                    preview: {
                        previewId: 'preview_1',
                        selected: 10,
                        totalAdvertisedMsats: '600000',
                        seen: 42,
                        eligible: 30,
                        validUntil: 0,
                        seats: [],
                    },
                }),
            fiClientEligiblePayers: { type: 'payers', payers: [] },
        })
        render(tools, fedimint)

        fireEvent.press(screen.getByText('Go to screen'))
        const goToScreen = within(screen.getByTestId('go-to-screen-section'))
        fireEvent.press(goToScreen.getByText('Setup'))
        fireEvent.press(goToScreen.getByText('Confirm: quote ready'))

        await waitFor(() =>
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'ConfirmWalletService',
            ),
        )
        expect(fedimint.fiClientPreviewSelection).toHaveBeenCalledWith({
            federationSize: 10,
            plan: 'infiniteBestEffort',
        })
    })

    it('should cancel a running script when the simulated state is cleared', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        const cancel = jest.spyOn(tools.player, 'cancel')
        render(tools)

        fireEvent.press(screen.getByText('Advanced'))
        fireEvent.press(
            screen.getByText('Clear simulated wallet service state'),
        )

        expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('should play a script from the start without navigating', async () => {
        const tools = attachFiDevTools(jest.fn(), simulatorOnStorage())
        await tools.ready
        const play = jest.spyOn(tools, 'play')
        render(tools)

        fireEvent.press(screen.getByText('Advanced'))
        fireEvent.press(screen.getByText('Play scenario from start'))
        const advanced = within(screen.getByTestId('advanced-section'))
        fireEvent.press(advanced.getByText('Formation'))
        fireEvent.press(advanced.getByText('formation.happyPath'))

        expect(play).toHaveBeenCalledWith('formation.happyPath')
        expect(mockNavigation.navigate).not.toHaveBeenCalled()
        tools.player.cancel()
    })

    it("should pass a screen's params to navigate", async () => {
        const tools = attachFiDevTools(jest.fn(), simulatorOnStorage())
        await tools.ready
        render(tools)

        fireEvent.press(screen.getByText('Go to screen'))
        const goToScreen = within(screen.getByTestId('go-to-screen-section'))
        fireEvent.press(goToScreen.getByText('Lightning'))
        fireEvent.press(goToScreen.getByText('Settings: attached and verified'))

        await waitFor(() =>
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceSettings',
                { openSheet: 'provider' },
            ),
        )
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
