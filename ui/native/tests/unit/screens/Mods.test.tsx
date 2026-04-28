import { act, cleanup } from '@testing-library/react-native'
import React from 'react'

import { setIsInternetUnreachable, setupStore } from '@fedi/common/redux'
import { addCustomMod, setMiniAppOrder } from '@fedi/common/redux/mod'
import { FediMod } from '@fedi/common/types'

import SortableMiniAppsGrid from '../../../components/feature/fedimods/SortableMiniAppsGrid'
import Mods from '../../../screens/Mods'
import { renderWithProviders } from '../../utils/render'

jest.mock('../../../components/feature/fedimods/ModsHeader', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require('react')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native')

    return () => ReactMock.createElement(Text, null, 'Mini Apps Header')
})

jest.mock('../../../components/feature/fedimods/SortableMiniAppsGrid', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactMock = require('react')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native')

    return jest.fn(() =>
        ReactMock.createElement(
            Text,
            { testID: 'mini-app-grid' },
            'Mini Apps Grid',
        ),
    )
})

describe('Mods screen', () => {
    let store: ReturnType<typeof setupStore>

    const miniAppA: FediMod = {
        id: 'mini-app-a',
        title: 'Mini App A',
        url: 'https://a.example.com',
    }
    const miniAppB: FediMod = {
        id: 'mini-app-b',
        title: 'Mini App B',
        url: 'https://b.example.com',
    }

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        store.dispatch(addCustomMod({ fediMod: miniAppA }))
        store.dispatch(addCustomMod({ fediMod: miniAppB }))
    })

    afterEach(() => {
        cleanup()
    })

    it('should pass mini apps to the grid in saved order', () => {
        store.dispatch(
            setMiniAppOrder({
                miniAppOrder: [miniAppB.id, miniAppA.id],
            }),
        )

        renderWithProviders(<Mods />, { store })

        const gridProps = (SortableMiniAppsGrid as jest.Mock).mock.calls[0][0]

        expect(
            gridProps.miniApps.map((miniApp: FediMod) => miniApp.id),
        ).toEqual([miniAppB.id, miniAppA.id])
    })

    it('should keep grid mini apps stable across unrelated rerenders', () => {
        store.dispatch(
            setMiniAppOrder({
                miniAppOrder: [miniAppA.id, miniAppB.id],
            }),
        )

        const { rerender } = renderWithProviders(<Mods />, { store })

        const firstGridProps = (SortableMiniAppsGrid as jest.Mock).mock
            .calls[0][0]

        rerender(<Mods />)

        const secondGridProps = (SortableMiniAppsGrid as jest.Mock).mock
            .calls[1][0]

        expect(secondGridProps.miniApps).toBe(firstGridProps.miniApps)
        expect(secondGridProps.miniApps[0]).toBe(firstGridProps.miniApps[0])
    })

    it('should not rerender the grid after unrelated store updates', () => {
        store.dispatch(
            setMiniAppOrder({
                miniAppOrder: [miniAppA.id, miniAppB.id],
            }),
        )

        renderWithProviders(<Mods />, { store })

        expect(SortableMiniAppsGrid).toHaveBeenCalledTimes(1)

        act(() => {
            store.dispatch(setIsInternetUnreachable(true))
        })

        expect(SortableMiniAppsGrid).toHaveBeenCalledTimes(1)
    })
})
