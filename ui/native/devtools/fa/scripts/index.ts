import type { FaScript } from '../steps'
import { FORMATION_SCRIPTS } from './formation'
import { LIGHTNING_SCRIPTS } from './lightning'
import { RECOVERY_SCRIPTS } from './recovery'
import { SETTINGS_SCRIPTS } from './settings'
import { SETUP_SCRIPTS } from './setup'

export type FaScriptGroup = { title: string; scripts: FaScript[] }

export const FA_SCRIPT_GROUPS: FaScriptGroup[] = [
    { title: 'Setup', scripts: SETUP_SCRIPTS },
    { title: 'Formation', scripts: FORMATION_SCRIPTS },
    { title: 'Recovery', scripts: RECOVERY_SCRIPTS },
    { title: 'Lightning', scripts: LIGHTNING_SCRIPTS },
    { title: 'Settings', scripts: SETTINGS_SCRIPTS },
]

export function findFaScript(name: string): FaScript | undefined {
    for (const group of FA_SCRIPT_GROUPS) {
        const found = group.scripts.find(s => s.name === name)
        if (found) return found
    }
    return undefined
}
