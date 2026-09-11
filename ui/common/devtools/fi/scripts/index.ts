import type { FiScript } from '../steps'
import { FORMATION_SCRIPTS } from './formation'
import { LIGHTNING_SCRIPTS } from './lightning'
import { RECOVERY_SCRIPTS } from './recovery'
import { SETUP_SCRIPTS } from './setup'

export type FiScriptGroup = { title: string; scripts: FiScript[] }

export const FI_SCRIPT_GROUPS: FiScriptGroup[] = [
    { title: 'Setup', scripts: SETUP_SCRIPTS },
    { title: 'Formation', scripts: FORMATION_SCRIPTS },
    { title: 'Recovery', scripts: RECOVERY_SCRIPTS },
    { title: 'Lightning', scripts: LIGHTNING_SCRIPTS },
]

export function findFiScript(name: string): FiScript | undefined {
    for (const group of FI_SCRIPT_GROUPS) {
        const found = group.scripts.find(s => s.name === name)
        if (found) return found
    }
    return undefined
}
