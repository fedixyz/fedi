import {
    formationAlreadyFormed,
    formationCreatedJoinFails,
    formationFails,
    formationFailsTerminally,
    formationHappyPath,
    formationReconnecting,
} from './scripts/formation'
import type { FiScript } from './steps'

// string literals rather than a native import: they are checked against
// RootStackParamList where the panel calls navigate()
export type FiScreenRoute = 'WalletServiceProgress' | 'WalletServiceDashboard'

export type FiScreen = {
    id: string
    label: string
    script: FiScript
    checkpoint: string
    route: FiScreenRoute
}

export type FiScreenGroup = { title: string; screens: FiScreen[] }

const progress = (
    id: string,
    label: string,
    script: FiScript,
    checkpoint: string,
): FiScreen => ({
    id,
    label,
    script,
    checkpoint,
    route: 'WalletServiceProgress',
})

export const FI_SCREEN_GROUPS: FiScreenGroup[] = [
    {
        title: 'Formation',
        screens: [
            progress(
                'formation.preparing',
                'Progress: preparing',
                formationHappyPath,
                'preparing',
            ),
            progress(
                'formation.acquiringSeats',
                'Progress: acquiring seats',
                formationHappyPath,
                'acquiringSeats',
            ),
            progress(
                'formation.preparingDkg',
                'Progress: preparing DKG',
                formationHappyPath,
                'preparingDkg',
            ),
            progress(
                'formation.dkgUnderway',
                'Progress: DKG underway',
                formationHappyPath,
                'dkgUnderway',
            ),
            progress(
                'formation.publishingSeatBindings',
                'Progress: publishing seat bindings',
                formationHappyPath,
                'publishingSeatBindings',
            ),
            progress(
                'formation.formedJoining',
                'Progress: formed, joining',
                formationHappyPath,
                'formedJoining',
            ),
            progress(
                'formation.retrying',
                'Progress: retrying after a guardian error',
                formationFails,
                'retrying',
            ),
            progress(
                'formation.failedTerminally',
                'Progress: terminal failure',
                formationFailsTerminally,
                'failedTerminally',
            ),
            {
                id: 'formation.reconnecting',
                label: 'Dashboard: reconnecting',
                script: formationReconnecting,
                checkpoint: 'reconnecting',
                route: 'WalletServiceDashboard',
            },
            progress(
                'formation.joinFailed',
                'Progress: wallet join failed',
                formationCreatedJoinFails,
                'joinFailed',
            ),
            {
                id: 'formation.formed',
                label: 'Dashboard: formed and joined',
                script: formationAlreadyFormed,
                checkpoint: 'formed',
                route: 'WalletServiceDashboard',
            },
        ],
    },
]

export function findFiScreen(id: string): FiScreen | undefined {
    for (const group of FI_SCREEN_GROUPS) {
        const screen = group.screens.find(s => s.id === id)
        if (screen) return screen
    }
    return undefined
}
