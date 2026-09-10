import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'

import { attachFiDevTools } from '@fedi/common/devtools/fi'

import WalletServiceDevTools from '../../../../screens/developer/WalletServiceDevTools'
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

describe('WalletServiceDevTools', () => {
    it('should update the simulator switch and offer a reload', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        renderWithProviders(<WalletServiceDevTools tools={tools} />)

        fireEvent.press(screen.getByText('Off'))

        await screen.findByText('Reload to apply')
        expect(tools.getSwitches().simulator).toBe('off')
    })

    it('should seed the mock wallets into redux when the payer source becomes mock', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        await tools.setSwitches({ simulator: 'on', payerSource: 'none' })
        const { store } = renderWithProviders(
            <WalletServiceDevTools tools={tools} />,
        )

        fireEvent.press(screen.getByText('Mock'))

        await screen.findByText('Reload to apply')
        expect(store.getState().federation.federations.length).toBeGreaterThan(
            0,
        )
        expect(tools.getSwitches().payerSource).toBe('mock')
    })

    it('should remove the mock wallets from redux when the payer source leaves mock', async () => {
        const tools = attachFiDevTools(jest.fn(), memoryStorage())
        await tools.ready
        const { store } = renderWithProviders(
            <WalletServiceDevTools tools={tools} />,
        )

        fireEvent.press(screen.getByText('Mock'))
        fireEvent.press(screen.getByText('Real'))

        await screen.findByText('Reload to apply')
        expect(store.getState().federation.federations).toHaveLength(0)
        expect(tools.getSwitches().payerSource).toBe('real')
    })
})
