import { v4 } from 'uuid'

import { FediMod } from '../../types'

export const newTestFediMod = (overrides?: Partial<FediMod>): FediMod => {
    const mod: FediMod = {
        id: v4(),
        title: 'Test Mod',
        url: 'testurl.com',
        ...(overrides || {}),
    }

    return mod
}
