import {
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react-native'
import React from 'react'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import { attachFaDevTools, FA_DEV_SWITCHES_KEY } from '../../../../devtools/fa'
import { TRANSFER_SEAT_INDEX } from '../../../../devtools/fa/scripts/transfer'
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
        FA_DEV_SWITCHES_KEY,
        JSON.stringify({ simulator: 'on', payerSource: 'mock' }),
    )
    return storage
}

const render = (
    tools: ReturnType<typeof attachFaDevTools>,
    // every jump re-reads the catalog
    fedimint = createMockFedimintBridge({
        getFeatureCatalog: () => Promise.resolve({}),
    }),
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
        const tools = attachFaDevTools(jest.fn(), memoryStorage())
        await tools.ready
        render(tools)

        fireEvent.press(screen.getByText('Off'))

        await screen.findByText(
            'Quit and relaunch the app to apply the simulator switch.',
        )
        expect(tools.getSwitches().simulator).toBe('off')
    })

    it('should not ask for a relaunch when only the payer source changes', async () => {
        const tools = attachFaDevTools(jest.fn(), memoryStorage())
        await tools.ready
        render(tools)

        fireEvent.press(screen.getByText('None'))

        expect(tools.getSwitches().payerSource).toBe('none')
        expect(screen.queryByText(/Quit and relaunch/)).toBeNull()
    })

    it('should seed the mock wallets into redux when the payer source becomes mock', async () => {
        const tools = attachFaDevTools(jest.fn(), memoryStorage())
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
        const tools = attachFaDevTools(jest.fn(), memoryStorage())
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
        const tools = attachFaDevTools(jest.fn(), simulatorOnStorage())
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
        const tools = attachFaDevTools(jest.fn(), simulatorOnStorage())
        await tools.ready
        const fedimint = createMockFedimintBridge({
            faClientPreviewSelection: () =>
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
            faClientEligiblePayers: { type: 'payers', payers: [] },
            getFeatureCatalog: () => Promise.resolve({}),
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
        expect(fedimint.faClientPreviewSelection).toHaveBeenCalledWith({
            federationSize: 10,
            plan: 'infiniteBestEffort',
        })
    })

    it('should cancel a running script when the simulated state is cleared', async () => {
        const tools = attachFaDevTools(jest.fn(), memoryStorage())
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
        const tools = attachFaDevTools(jest.fn(), simulatorOnStorage())
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
        const tools = attachFaDevTools(jest.fn(), simulatorOnStorage())
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

    describe('guardian replacement screens', () => {
        it('should list the guardian replacement states once, under Go to screen', async () => {
            const tools = attachFaDevTools(jest.fn(), simulatorOnStorage())
            await tools.ready
            render(tools)

            fireEvent.press(screen.getByText('Go to screen'))
            fireEvent.press(screen.getByText('Advanced'))
            fireEvent.press(screen.getByText('Play scenario from start'))

            expect(screen.getAllByText('Guardian replacement')).toHaveLength(1)
            expect(
                within(screen.getByTestId('advanced-section')).queryByText(
                    'Guardian replacement',
                ),
            ).not.toBeOnTheScreen()
        })

        const goTo = (label: string) => {
            fireEvent.press(screen.getByText('Go to screen'))
            const goToScreen = within(
                screen.getByTestId('go-to-screen-section'),
            )
            fireEvent.press(goToScreen.getByText('Guardian replacement'))
            fireEvent.press(goToScreen.getByText(label))
        }
        const transferFlag = (store: ReturnType<typeof render>['store']) =>
            store.getState().environment.featureFlags
                ?.wallet_service_guardian_transfer
        // a bridge older than the flag leaves it out of the catalog entirely
        const renderWithOldBridge = async () => {
            const tools = attachFaDevTools(jest.fn(), simulatorOnStorage())
            await tools.ready
            const fedimint = createMockFedimintBridge({
                getFeatureCatalog: () => Promise.resolve({ other_flag: {} }),
            })
            const rendered = render(tools, fedimint)
            return { tools, fedimint, ...rendered }
        }

        it('should open the review on the seat the scenario replaces', async () => {
            const { tools } = await renderWithOldBridge()

            goTo('Review: paid')

            await waitFor(() =>
                expect(mockNavigation.navigate).toHaveBeenCalledWith(
                    'WalletServiceGuardianTransfer',
                    { seatIndex: TRANSFER_SEAT_INDEX },
                ),
            )
            tools.player.cancel()
        })

        it('should open the dashboard with the guardian list shown', async () => {
            const { tools } = await renderWithOldBridge()

            goTo('Entry: Guardians sheet')

            await waitFor(() =>
                expect(mockNavigation.navigate).toHaveBeenCalledWith(
                    'WalletServiceDashboard',
                    { openSheet: 'guardians' },
                ),
            )
            tools.player.cancel()
        })

        it("should force the flag on over a bridge that lacks it, keeping the bridge's other flags", async () => {
            const { tools, store } = await renderWithOldBridge()

            goTo('Review: paid')

            await waitFor(() =>
                expect(mockNavigation.navigate).toHaveBeenCalled(),
            )
            expect(transferFlag(store)).toEqual({})
            expect(store.getState().environment.featureFlags).toMatchObject({
                other_flag: {},
            })
            tools.player.cancel()
        })

        it('should turn the flag off for a flag-off screen and back on at the next jump', async () => {
            const { tools, store } = await renderWithOldBridge()

            goTo('Flag off: Settings')

            await waitFor(() => expect(transferFlag(store)).toBeNull())
            expect(mockNavigation.navigate).toHaveBeenCalledWith(
                'WalletServiceSettings',
                undefined,
            )

            // a jump closes the list but leaves the group it came from open
            fireEvent.press(screen.getByText('Go to screen'))
            fireEvent.press(screen.getByText('Entry: Settings row'))

            await waitFor(() => expect(transferFlag(store)).toEqual({}))
            tools.player.cancel()
        })

        it('should turn the flag back on after Developer Settings remounts the panel', async () => {
            const { tools, store, rerender } = await renderWithOldBridge()
            goTo('Flag off: Guardians sheet')
            await waitFor(() => expect(transferFlag(store)).toBeNull())

            rerender(
                <WalletServiceDevTools
                    key="remounted"
                    tools={tools}
                    navigation={mockNavigation}
                />,
            )
            goTo('Entry: Settings row')

            await waitFor(() => expect(transferFlag(store)).toEqual({}))
            tools.player.cancel()
        })

        it("should put the bridge's own catalog back when the simulated state is cleared", async () => {
            const { tools, store } = await renderWithOldBridge()
            goTo('Flag off: Guardians sheet')
            await waitFor(() => expect(transferFlag(store)).toBeNull())

            fireEvent.press(screen.getByText('Advanced'))
            fireEvent.press(
                screen.getByText('Clear simulated wallet service state'),
            )

            await waitFor(() =>
                expect(store.getState().environment.featureFlags).toEqual({
                    other_flag: {},
                }),
            )
            tools.player.cancel()
        })
    })

    it('should disable Go to screen while the simulator is off', async () => {
        const tools = attachFaDevTools(jest.fn(), memoryStorage())
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
