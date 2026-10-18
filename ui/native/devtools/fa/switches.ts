import type { StorageApi } from '@fedi/common/types'

export type FaSimulatorSwitch = 'on' | 'off'
export type FaPayerSource = 'real' | 'mock' | 'none'

export interface FaDevSwitches {
    simulator: FaSimulatorSwitch
    payerSource: FaPayerSource
}

export const DEFAULT_FA_DEV_SWITCHES: FaDevSwitches = {
    // turning this on seeds mock federations into the app's federation list,
    // so every appium suite boots already onboarded and fails
    simulator: 'off',
    payerSource: 'mock',
}

export const FA_DEV_SWITCHES_KEY = 'fedi:devtools:fi'

const SIMULATOR_VALUES: FaSimulatorSwitch[] = ['on', 'off']
const PAYER_SOURCE_VALUES: FaPayerSource[] = ['real', 'mock', 'none']

const pick = <T extends string>(
    value: unknown,
    allowed: T[],
    fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback)

export async function loadFaDevSwitches(
    storage: StorageApi,
): Promise<FaDevSwitches> {
    const raw = await storage.getItem(FA_DEV_SWITCHES_KEY)
    if (!raw) return DEFAULT_FA_DEV_SWITCHES
    let parsed: Partial<FaDevSwitches> = {}
    try {
        parsed = JSON.parse(raw)
    } catch {
        return DEFAULT_FA_DEV_SWITCHES
    }
    return {
        simulator: pick(
            parsed.simulator,
            SIMULATOR_VALUES,
            DEFAULT_FA_DEV_SWITCHES.simulator,
        ),
        payerSource: pick(
            parsed.payerSource,
            PAYER_SOURCE_VALUES,
            DEFAULT_FA_DEV_SWITCHES.payerSource,
        ),
    }
}

export async function saveFaDevSwitches(
    storage: StorageApi,
    switches: FaDevSwitches,
): Promise<void> {
    await storage.setItem(FA_DEV_SWITCHES_KEY, JSON.stringify(switches))
}
